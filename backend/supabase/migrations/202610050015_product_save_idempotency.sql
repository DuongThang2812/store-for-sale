create table public.product_save_requests (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null,
  payload_hash text not null,
  product_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (store_id, request_id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);
alter table public.product_save_requests enable row level security;
revoke all on public.product_save_requests from public, anon, authenticated;
create trigger product_save_requests_store_guard before insert or update or delete
  on public.product_save_requests for each row execute function public.guard_store_business_write();

create function public.save_product_idempotent(p_store_id uuid, p_request_id uuid, p_product jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.product_save_requests%rowtype;
  v_hash text;
  v_id uuid;
  v_version bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được sửa mặt hàng.';
  end if;
  if p_request_id is null or jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'Thông tin mặt hàng chưa hợp lệ.';
  end if;
  v_hash := encode(extensions.digest(p_product::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.product_save_requests where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã dùng cho mặt hàng khác.'; end if;
    return v_existing.product_id;
  end if;
  v_id := (p_product ->> 'p_product_id')::uuid;
  if v_id is not null then
    select version into v_version from public.products where store_id = p_store_id and id = v_id for update;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if (p_product ->> 'expected_version')::bigint is distinct from v_version then
      raise exception 'Mặt hàng đã thay đổi. Hãy tải lại thông tin trước khi lưu.';
    end if;
  end if;
  v_id := public.save_product(p_store_id, p_product ->> 'p_name', p_product ->> 'p_category',
    p_product ->> 'p_product_group', p_product ->> 'p_base_unit', p_product -> 'p_units',
    coalesce((p_product ->> 'p_opening_stock')::bigint, 0),
    coalesce((p_product ->> 'p_low_stock_threshold')::bigint, 5),
    coalesce((p_product ->> 'p_is_active')::boolean, true), v_id);
  insert into public.product_save_requests(store_id, request_id, payload_hash, product_id, created_by)
    values(p_store_id, p_request_id, v_hash, v_id, auth.uid());
  return v_id;
end;
$$;
revoke all on function public.save_product_idempotent(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_product_idempotent(uuid, uuid, jsonb) to authenticated;
