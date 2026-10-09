-- One file is one PostgreSQL transaction. New products and all stock receipts
-- commit together, or none commit. Request IDs make network retries safe.
create table public.stock_csv_imports (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count between 1 and 2000),
  receipt_ids jsonb not null check (jsonb_typeof(receipt_ids) = 'array'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (store_id, request_id)
);
alter table public.stock_csv_imports enable row level security;
create policy stock_csv_imports_owner_read on public.stock_csv_imports for select to authenticated
  using ((select public.is_store_owner(store_id)));
revoke all on public.stock_csv_imports from public, anon, authenticated;
grant select on public.stock_csv_imports to authenticated;
create trigger guard_store_business_write before insert or update or delete on public.stock_csv_imports
  for each row execute function public.guard_store_business_write();

create or replace function public.import_stock_csv(
  p_store_id uuid, p_request_id uuid, p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_existing public.stock_csv_imports%rowtype;
  v_row jsonb;
  v_product jsonb;
  v_product_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_receipt jsonb;
  v_count integer;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ tiệm được nhập CSV hàng loạt.' using errcode = '42501';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Danh sách CSV chưa hợp lệ.'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 1 and 2000 or octet_length(p_rows::text) > 8388608 then
    raise exception 'CSV cần từ 1 đến 2.000 dòng và tối đa 8 MB dữ liệu.';
  end if;
  v_hash := encode(extensions.digest(p_rows::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_csv_imports
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho file CSV khác.';
    end if;
    return jsonb_build_object('row_count', v_existing.row_count,
      'receipt_ids', v_existing.receipt_ids, 'duplicate', true);
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Dòng CSV chưa hợp lệ.'; end if;
    v_product_id := nullif(v_row ->> 'existing_product_id','')::uuid;
    if v_product_id is null then
      v_product := v_row -> 'product';
      if jsonb_typeof(v_product) <> 'object' then raise exception 'Hàng mới thiếu thông tin.'; end if;
      v_product_id := public.save_product(p_store_id,
        v_product ->> 'name', v_product ->> 'category',
        v_product ->> 'product_group', v_product ->> 'base_unit',
        v_product -> 'units', 0, (v_product ->> 'low_stock_threshold')::bigint,
        true, null);
    else
      if not exists (select 1 from public.products
        where id = v_product_id and store_id = p_store_id and is_active) then
        raise exception 'Mặt hàng CSV không còn trong kho đang bán.';
      end if;
    end if;
    if (v_row ->> 'unit_key') !~ '^[a-z][a-z0-9_]{0,23}$'
      or nullif(v_row ->> 'quantity','') is null
      or nullif(v_row ->> 'unit_cost','') is null then
      raise exception 'Đơn vị, số lượng hoặc giá nhập CSV chưa hợp lệ.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'unit_key', v_row ->> 'unit_key',
      'quantity', (v_row ->> 'quantity')::numeric,
      'unit_cost', (v_row ->> 'unit_cost')::bigint));
    if jsonb_array_length(v_items) = 500 then
      v_receipt := public.receive_stock(p_store_id, extensions.gen_random_uuid(), v_items, 'Nhập hàng từ CSV');
      v_receipts := v_receipts || jsonb_build_array(v_receipt -> 'receipt_id');
      v_items := '[]'::jsonb;
    end if;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    v_receipt := public.receive_stock(p_store_id, extensions.gen_random_uuid(), v_items, 'Nhập hàng từ CSV');
    v_receipts := v_receipts || jsonb_build_array(v_receipt -> 'receipt_id');
  end if;
  insert into public.stock_csv_imports
    (store_id, request_id, payload_sha256, row_count, receipt_ids, created_by)
    values (p_store_id, p_request_id, v_hash, v_count, v_receipts, v_user);
  insert into public.audit_logs (store_id, actor_id, action, entity_type, details)
    values (p_store_id, v_user, 'stock.csv_imported', 'stock_csv_import',
      jsonb_build_object('rows', v_count, 'receipts', jsonb_array_length(v_receipts)));
  return jsonb_build_object('row_count', v_count, 'receipt_ids', v_receipts, 'duplicate', false);
end;
$$;
revoke all on function public.import_stock_csv(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_stock_csv(uuid, uuid, jsonb) to authenticated;
