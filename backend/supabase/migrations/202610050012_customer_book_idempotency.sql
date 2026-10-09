-- Keep a newly added customer visible in the debt book before the first sale.
-- A full repayment closes the book entry without hard-deleting history.
alter table public.customers drop constraint customers_check;

create table public.customer_create_requests (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null,
  customer_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (store_id, request_id),
  foreign key (store_id, customer_id) references public.customers(store_id, id) on delete restrict
);
alter table public.customer_create_requests enable row level security;
revoke all on public.customer_create_requests from public, anon, authenticated;
create trigger guard_store_business_write before insert or update or delete on public.customer_create_requests
  for each row execute function public.guard_store_business_write();

create or replace function public.create_customer(
  p_store_id uuid, p_request_id uuid, p_name text,
  p_phone text default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_hash text;
  v_existing public.customer_create_requests%rowtype;
begin
  if v_user is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120
    or char_length(coalesce(p_phone,'')) > 30 or char_length(coalesce(p_note,'')) > 500 then
    raise exception 'Thông tin khách chưa hợp lệ.';
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'name', btrim(p_name), 'phone', nullif(btrim(p_phone),''),
    'note', nullif(btrim(p_note),'')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.customer_create_requests
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho khách khác.';
    end if;
    return jsonb_build_object('customer_id', v_existing.customer_id, 'duplicate', true);
  end if;
  insert into public.customers (store_id, name, phone, note, is_in_debt_book)
    values (p_store_id, btrim(p_name), nullif(btrim(p_phone),''),
      nullif(btrim(p_note),''), true) returning id into v_id;
  insert into public.customer_create_requests
    (store_id, request_id, customer_id, payload_sha256, created_by)
    values (p_store_id, p_request_id, v_id, v_hash, v_user);
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
    values (p_store_id, v_user, 'customer.created', 'customer', v_id);
  return jsonb_build_object('customer_id', v_id, 'duplicate', false);
end;
$$;
revoke all on function public.create_customer(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.create_customer(uuid, uuid, text, text, text) to authenticated;
