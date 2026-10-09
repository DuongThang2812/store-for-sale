-- Cost reads are owner-only; no column grants for staff are widened.
create function public.inventory_product_cost(p_store_id uuid, p_product_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được xem giá vốn.';
  end if;
  select * into v_product from public.products where store_id = p_store_id and id = p_product_id;
  if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
  return jsonb_build_object('product_id', v_product.id, 'stock_base', v_product.stock_base,
    'cost_known', v_product.average_cost_per_base is not null,
    'average_cost_per_base', v_product.average_cost_per_base);
end;
$$;

create function public.record_inventory_count_reviewed(p_store_id uuid, p_request_id uuid,
  p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_version bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được kiểm kê kho.';
  end if;
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Danh sách kiểm kê phải có từ 1 đến 500 mặt hàng.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  -- A committed retry must be returned before checking versions changed by that commit.
  if exists (select 1 from public.inventory_counts where store_id = p_store_id and client_request_id = p_request_id) then
    return public.record_inventory_count(p_store_id, p_request_id, p_items, p_note);
  end if;
  perform p.id from public.products p where p.store_id = p_store_id
    and exists (select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text)
    order by p.id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select version into v_version from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid;
    if not found then raise exception 'Không tìm thấy mặt hàng kiểm kê.'; end if;
    if (v_item ->> 'expected_version')::bigint is distinct from v_version then
      raise exception 'Kho đã có giao dịch mới. Hãy tải lại và đếm lại mặt hàng trước khi kiểm kê.';
    end if;
  end loop;
  return public.record_inventory_count(p_store_id, p_request_id, p_items, p_note);
end;
$$;
revoke all on function public.inventory_product_cost(uuid, uuid),
  public.record_inventory_count_reviewed(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.inventory_product_cost(uuid, uuid),
  public.record_inventory_count_reviewed(uuid, uuid, jsonb, text) to authenticated;
