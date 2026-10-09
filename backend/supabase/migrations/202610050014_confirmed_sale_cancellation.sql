-- A cancellation preview is a server snapshot, never a client-computed balance.
create table public.sale_cancellation_requests (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (store_id, request_id)
);
alter table public.sale_cancellation_requests enable row level security;
revoke all on public.sale_cancellation_requests from public, anon, authenticated;
create trigger sale_cancellation_requests_store_guard before insert or update or delete
  on public.sale_cancellation_requests for each row execute function public.guard_store_business_write();

create function public.preview_sale_cancellation(p_store_id uuid, p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sale public.sales%rowtype;
  v_items jsonb;
  v_debt bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được hủy đơn.';
  end if;
  select * into v_sale from public.sales where store_id = p_store_id and id = p_sale_id;
  if not found then raise exception 'Không tìm thấy đơn bán hàng.'; end if;
  if v_sale.status <> 'completed' then raise exception 'Đơn này đã hủy.'; end if;
  select jsonb_agg(jsonb_build_object('product_id', i.product_id,
    'name', i.product_name, 'quantity_base', i.base_quantity, 'base_unit', p.base_unit)
    order by i.product_id, i.id) into v_items
    from public.sale_items i join public.products p on p.store_id = i.store_id and p.id = i.product_id
    where i.store_id = p_store_id and i.sale_id = p_sale_id;
  if v_items is null then raise exception 'Đơn không có chi tiết mặt hàng để hoàn kho.'; end if;
  v_debt := case when v_sale.payment_type = 'credit' then v_sale.outstanding_amount else 0 end;
  return jsonb_build_object('sale_id', p_sale_id, 'payment_type', v_sale.payment_type,
    'created_at', v_sale.created_at, 'total_amount', v_sale.total_amount,
    'debt_reduction', v_debt, 'refund_amount', v_sale.total_amount - v_debt,
    'items', v_items, 'preview_token', encode(extensions.digest(
      jsonb_build_array(p_sale_id, v_sale.status, v_sale.total_amount, v_debt, v_items)::text,
      'sha256'), 'hex'));
end;
$$;

create function public.cancel_sale_confirmed(p_store_id uuid, p_sale_id uuid,
  p_reason text, p_request_id uuid, p_preview_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  v_preview jsonb;
  v_hash text;
  v_existing public.sale_cancellation_requests%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được hủy đơn.';
  end if;
  if p_request_id is null or p_preview_token is null then raise exception 'Thiếu mã xác nhận hủy đơn.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_array(p_sale_id, btrim(p_reason), p_preview_token)::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.sale_cancellation_requests
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã dùng cho lần hủy khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate', true);
  end if;
  -- Follow the same customer -> sale -> product lock order as debt repayment.
  select customer_id into v_customer from public.sales where store_id = p_store_id and id = p_sale_id;
  if v_customer is not null then
    perform 1 from public.customers where store_id = p_store_id and id = v_customer for update;
  end if;
  perform 1 from public.sales where store_id = p_store_id and id = p_sale_id for update;
  v_preview := public.preview_sale_cancellation(p_store_id, p_sale_id);
  if v_preview ->> 'preview_token' <> p_preview_token then
    raise exception 'Số tiền hoàn hoặc công nợ đã thay đổi. Hãy mở lại xác nhận hủy đơn.';
  end if;
  v_result := public.cancel_sale(p_store_id, p_sale_id, p_reason);
  insert into public.sale_cancellation_requests(store_id, request_id, payload_hash, result, created_by)
    values(p_store_id, p_request_id, v_hash, v_result, auth.uid());
  return v_result;
end;
$$;
revoke all on function public.preview_sale_cancellation(uuid, uuid),
  public.cancel_sale_confirmed(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.preview_sale_cancellation(uuid, uuid),
  public.cancel_sale_confirmed(uuid, uuid, text, uuid, text) to authenticated;

-- Historical quantities use the original base unit even when today's stock is zero.
create function public.guard_historical_base_unit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.base_unit is distinct from old.base_unit and exists (
    select 1 from public.stock_movements where store_id = old.store_id and product_id = old.id
  ) then raise exception 'Mặt hàng đã có lịch sử kho; không thể đổi đơn vị nhỏ nhất. Hãy tạo mặt hàng mới.'; end if;
  return new;
end;
$$;
create trigger products_historical_base_unit before update of base_unit on public.products
  for each row execute function public.guard_historical_base_unit();
