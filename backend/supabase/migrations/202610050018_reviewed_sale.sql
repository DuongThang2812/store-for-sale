create table public.reviewed_sale_requests (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(store_id, request_id)
);
alter table public.reviewed_sale_requests enable row level security;
revoke all on public.reviewed_sale_requests from public, anon, authenticated;
create trigger reviewed_sale_requests_store_guard before insert or update or delete
  on public.reviewed_sale_requests for each row execute function public.guard_store_business_write();

create function public.create_sale_reviewed(p_store_id uuid, p_request_id uuid, p_items jsonb,
  p_payment_type text default 'cash', p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb; v_hash text; v_item jsonb; v_version bigint; v_result jsonb;
  v_existing public.reviewed_sale_requests%rowtype;
begin
  if auth.uid() is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.' using errcode = '42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Giỏ hàng chưa hợp lệ.'; end if;
  select jsonb_agg(value - 'expected_version' order by value->>'product_id', value->>'unit_key')
    into v_items from jsonb_array_elements(p_items);
  v_hash := encode(extensions.digest(jsonb_build_array(v_items,p_payment_type,p_customer_id)::text,'sha256'),'hex');
  if p_payment_type = 'credit' then
    perform 1 from public.customers where store_id=p_store_id and id=p_customer_id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text,0));
  select * into v_existing from public.reviewed_sale_requests where store_id=p_store_id and request_id=p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã được dùng cho đơn bán khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate',true);
  end if;
  perform p.id from public.products p where p.store_id=p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value->>'product_id'=p.id::text
  ) order by p.id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select version into v_version from public.products where store_id=p_store_id and id=(v_item->>'product_id')::uuid;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if (v_item->>'expected_version')::bigint is distinct from v_version then
      raise exception 'Giá hoặc tồn kho đã thay đổi. Hãy tải lại giỏ hàng và xác nhận số tiền mới.';
    end if;
  end loop;
  v_result := public.create_sale(p_store_id,p_request_id,v_items,p_payment_type,p_customer_id);
  insert into public.reviewed_sale_requests(store_id,request_id,payload_hash,result,created_by)
    values(p_store_id,p_request_id,v_hash,v_result,auth.uid());
  return v_result;
end;
$$;
revoke all on function public.create_sale_reviewed(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.create_sale_reviewed(uuid, uuid, jsonb, text, uuid) to authenticated;
