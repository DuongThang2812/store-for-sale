-- One atomic, owner-approved import of the verified browser snapshot.
-- Historical entries remain immutable archive data; current stock and debt
-- become opening balances, never replayed as sales or purchases.
alter table public.sales add column is_legacy_opening boolean not null default false;
alter table public.legacy_import_batches
  add column request_id uuid unique,
  add column payload_sha256 text check (payload_sha256 ~ '^[0-9a-f]{64}$');

create table public.legacy_product_links (
  store_id uuid not null references public.stores(id) on delete restrict,
  batch_id uuid not null references public.legacy_import_batches(id) on delete restrict,
  legacy_id text not null check (char_length(legacy_id) between 1 and 200),
  product_id uuid not null,
  primary key (store_id, legacy_id),
  unique (store_id, product_id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);
create table public.legacy_customer_links (
  store_id uuid not null references public.stores(id) on delete restrict,
  batch_id uuid not null references public.legacy_import_batches(id) on delete restrict,
  legacy_id text not null check (char_length(legacy_id) between 1 and 200),
  customer_id uuid not null,
  primary key (store_id, legacy_id),
  unique (store_id, customer_id),
  foreign key (store_id, customer_id) references public.customers(store_id, id) on delete restrict
);
create table public.legacy_history_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  batch_id uuid not null references public.legacy_import_batches(id) on delete restrict,
  legacy_id text not null check (char_length(legacy_id) between 1 and 200),
  kind text not null check (kind in ('sale','debt','payment','stock','adjustment','edit','cancel','restore')),
  customer_id uuid,
  occurred_at timestamptz not null,
  source_entry jsonb not null check (jsonb_typeof(source_entry) = 'object'),
  unique (store_id, legacy_id),
  foreign key (store_id, customer_id) references public.customers(store_id, id) on delete restrict
);
create index legacy_history_store_date_idx on public.legacy_history_entries (store_id, occurred_at desc, id);
create index legacy_history_customer_date_idx on public.legacy_history_entries (store_id, customer_id, occurred_at desc);

do $$
declare v_table text;
begin
  foreach v_table in array array['legacy_product_links','legacy_customer_links','legacy_history_entries'] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_store_member(store_id)))',
      v_table || '_member_read', v_table);
    execute format('create trigger guard_store_business_write before insert or update or delete on public.%I for each row execute function public.guard_store_business_write()', v_table);
  end loop;
end;
$$;

-- Archive and link rows cannot be silently rewritten even by a later RPC.
create or replace function public.prevent_legacy_archive_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Dữ liệu chuyển từ máy chỉ được ghi một lần.' using errcode = '42501';
end;
$$;
create trigger legacy_history_immutable before update or delete on public.legacy_history_entries
  for each row execute function public.prevent_legacy_archive_change();
create trigger legacy_product_links_immutable before update or delete on public.legacy_product_links
  for each row execute function public.prevent_legacy_archive_change();
create trigger legacy_customer_links_immutable before update or delete on public.legacy_customer_links
  for each row execute function public.prevent_legacy_archive_change();

create or replace function public.import_legacy_snapshot(
  p_store_id uuid, p_request_id uuid, p_snapshot_sha256 text,
  p_persist_version integer, p_products jsonb, p_customers jsonb, p_entries jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_batch uuid;
  v_existing public.legacy_import_batches%rowtype;
  v_payload_hash text;
  v_product jsonb;
  v_customer jsonb;
  v_entry jsonb;
  v_id uuid;
  v_match_count integer;
  v_stock bigint := 0;
  v_debt bigint := 0;
  v_opening_count integer := 0;
  v_customer_id uuid;
  v_expected_stock numeric;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ tiệm được chuyển dữ liệu cũ.' using errcode = '42501';
  end if;
  if p_request_id is null or p_snapshot_sha256 !~ '^[0-9a-f]{64}$'
    or p_persist_version <> 0 then raise exception 'Mã bản sao lưu chưa hợp lệ.'; end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_customers) <> 'array'
    or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Cấu trúc dữ liệu cũ chưa hợp lệ.';
  end if;
  if jsonb_array_length(p_products) > 2000 or jsonb_array_length(p_customers) > 2000
    or jsonb_array_length(p_entries) > 10000
    or octet_length(p_products::text) + octet_length(p_customers::text)
      + octet_length(p_entries::text) > 8388608 then
    raise exception 'Bản dữ liệu quá lớn; cần chia đợt có kiểm soát.';
  end if;
  v_payload_hash := encode(extensions.digest(jsonb_build_object(
    'products', p_products, 'customers', p_customers, 'entries', p_entries
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('legacy:' || p_store_id::text, 0));
  -- A normal sale locks the shop FOR SHARE; this lock makes the empty-shop
  -- precondition and every opening balance serializable with those writes.
  perform 1 from public.stores where id = p_store_id and status = 'active' for update;
  if not found then raise exception 'Cửa hàng không hoạt động.'; end if;
  select * into v_existing from public.legacy_import_batches where store_id = p_store_id;
  if found then
    if v_existing.status = 'completed' and v_existing.snapshot_sha256 = p_snapshot_sha256
      and v_existing.request_id = p_request_id and v_existing.payload_sha256 = v_payload_hash then
      return jsonb_build_object('batch_id', v_existing.id, 'counts', v_existing.counts, 'duplicate', true);
    end if;
    raise exception 'Cửa hàng đã chuyển một bản dữ liệu khác; không nhập lại.';
  end if;
  if exists (select 1 from public.sales where store_id = p_store_id)
    or exists (select 1 from public.stock_receipts where store_id = p_store_id)
    or exists (select 1 from public.debt_payments where store_id = p_store_id)
    or exists (select 1 from public.customers where store_id = p_store_id)
    or exists (select 1 from public.products where store_id = p_store_id and (is_active or stock_base > 0))
    or exists (select 1 from public.inventory_counts where store_id = p_store_id) then
    raise exception 'Cửa hàng DB đã có giao dịch hoặc hàng đang bán. Không thể chồng dữ liệu cũ.';
  end if;
  if (select count(distinct value ->> 'legacy_id') from jsonb_array_elements(p_products)) <> jsonb_array_length(p_products)
    or (select count(distinct value ->> 'legacy_id') from jsonb_array_elements(p_customers)) <> jsonb_array_length(p_customers)
    or (select count(distinct value ->> 'legacy_id') from jsonb_array_elements(p_entries)) <> jsonb_array_length(p_entries) then
    raise exception 'Mã dữ liệu cũ bị thiếu hoặc trùng.';
  end if;
  if (select count(distinct lower(btrim(value ->> 'name'))) from jsonb_array_elements(p_products)) <> jsonb_array_length(p_products) then
    raise exception 'Tên mặt hàng cũ bị trùng; cần đối chiếu trước khi nhập.';
  end if;
  insert into public.legacy_import_batches
    (store_id, snapshot_sha256, persist_version, status, created_by, request_id, payload_sha256)
  values (p_store_id, p_snapshot_sha256, p_persist_version, 'started', v_user, p_request_id, v_payload_hash)
  returning id into v_batch;

  for v_product in select value from jsonb_array_elements(p_products) loop
    if char_length(coalesce(v_product ->> 'legacy_id','')) not between 1 and 200
      or coalesce((v_product ->> 'stock_base')::numeric, -1) not between 0 and 9223372036854775807 then
      raise exception 'Mặt hàng cũ chưa hợp lệ.';
    end if;
    select count(*), min(id) into v_match_count, v_id from public.products
      where store_id = p_store_id and lower(btrim(name)) = lower(btrim(v_product ->> 'name'));
    if v_match_count > 1 then raise exception 'Danh mục DB có tên trùng, cần đối chiếu trước khi nhập.'; end if;
    if v_id is not null and exists (select 1 from public.products where id = v_id and (is_active or stock_base <> 0)) then
      raise exception 'Mặt hàng DB đã hoạt động, không thể ghi đè.';
    end if;
    v_id := public.save_product(p_store_id, v_product ->> 'name', v_product ->> 'category',
      v_product ->> 'product_group', v_product ->> 'base_unit', v_product -> 'units',
      case when v_match_count = 0 then (v_product ->> 'stock_base')::bigint else 0 end,
      (v_product ->> 'low_stock_threshold')::bigint,
      (v_product ->> 'is_active')::boolean, v_id);
    if v_match_count > 0 and (v_product ->> 'stock_base')::bigint > 0 then
      update public.products set stock_base = (v_product ->> 'stock_base')::bigint, version = version + 1
        where id = v_id;
      insert into public.stock_movements
        (store_id, product_id, movement_type, quantity_base, balance_after, reason, created_by)
      values (p_store_id, v_id, 'opening', (v_product ->> 'stock_base')::bigint,
        (v_product ->> 'stock_base')::bigint, 'Tồn đầu kỳ chuyển từ máy', v_user);
    end if;
    insert into public.legacy_product_links (store_id, batch_id, legacy_id, product_id)
      values (p_store_id, v_batch, v_product ->> 'legacy_id', v_id);
    v_stock := v_stock + (v_product ->> 'stock_base')::bigint;
  end loop;

  for v_customer in select value from jsonb_array_elements(p_customers) loop
    if char_length(coalesce(v_customer ->> 'legacy_id','')) not between 1 and 200
      or coalesce((v_customer ->> 'current_debt')::numeric, -1) not between 0 and 9223372036854775807 then
      raise exception 'Khách cũ hoặc số nợ chưa hợp lệ.';
    end if;
    v_id := public.save_customer(p_store_id, v_customer ->> 'name',
      nullif(v_customer ->> 'phone',''), nullif(v_customer ->> 'note',''), null);
    insert into public.legacy_customer_links (store_id, batch_id, legacy_id, customer_id)
      values (p_store_id, v_batch, v_customer ->> 'legacy_id', v_id);
    if (v_customer ->> 'current_debt')::bigint > 0 then
      -- A synthetic receivable lets the existing FIFO debt-payment RPC allocate
      -- future payments without counting this opening amount as new revenue.
      insert into public.sales (store_id, customer_id, payment_type, total_amount,
        outstanding_amount, client_request_id, created_by, is_legacy_opening)
      values (p_store_id, v_id, 'credit', (v_customer ->> 'current_debt')::bigint,
        (v_customer ->> 'current_debt')::bigint, extensions.gen_random_uuid(), v_user, true);
      update public.customers set current_debt = (v_customer ->> 'current_debt')::bigint,
        is_in_debt_book = true, last_transaction_at = now() where id = v_id;
      v_opening_count := v_opening_count + 1;
      v_debt := v_debt + (v_customer ->> 'current_debt')::bigint;
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if char_length(coalesce(v_entry ->> 'legacy_id','')) not between 1 and 200
      or (v_entry ->> 'kind') not in ('sale','debt','payment','stock','adjustment','edit','cancel','restore')
      or coalesce(v_entry ->> 'date','') !~ '^\\d{4}-\\d{2}-\\d{2}T' then
      raise exception 'Lịch sử cũ chưa hợp lệ.';
    end if;
    v_customer_id := null;
    if nullif(v_entry ->> 'customer_legacy_id','') is not null then
      select customer_id into v_customer_id from public.legacy_customer_links
        where store_id = p_store_id and legacy_id = v_entry ->> 'customer_legacy_id';
    end if;
    insert into public.legacy_history_entries
      (store_id, batch_id, legacy_id, kind, customer_id, occurred_at, source_entry)
    values (p_store_id, v_batch, v_entry ->> 'legacy_id', v_entry ->> 'kind',
      v_customer_id, (v_entry ->> 'date')::timestamptz, v_entry -> 'source_entry');
  end loop;
  select coalesce(sum(stock_base), 0) into v_expected_stock from public.products p
    join public.legacy_product_links l on l.product_id = p.id and l.store_id = p.store_id
    where l.batch_id = v_batch;
  if v_expected_stock <> v_stock
    or (select coalesce(sum(current_debt),0) from public.customers where store_id = p_store_id) <> v_debt
    or (select count(*) from public.legacy_history_entries where batch_id = v_batch) <> jsonb_array_length(p_entries) then
    raise exception 'Đối chiếu dữ liệu sau nhập chưa khớp; toàn bộ giao dịch được hủy.';
  end if;
  update public.legacy_import_batches set status = 'completed', completed_at = now(),
    counts = jsonb_build_object('products', jsonb_array_length(p_products),
      'customers', jsonb_array_length(p_customers), 'entries', jsonb_array_length(p_entries),
      'opening_debts', v_opening_count, 'stock_base_total', v_stock,
      'outstanding_debt', v_debt)
    where id = v_batch;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'legacy.snapshot_imported', 'legacy_import_batch', v_batch,
    jsonb_build_object('products', jsonb_array_length(p_products), 'customers', jsonb_array_length(p_customers),
      'entries', jsonb_array_length(p_entries), 'opening_debt', v_debt));
  return jsonb_build_object('batch_id', v_batch,
    'counts', (select counts from public.legacy_import_batches where id = v_batch), 'duplicate', false);
end;
$$;
revoke all on function public.import_legacy_snapshot(uuid, uuid, text, integer, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.import_legacy_snapshot(uuid, uuid, text, integer, jsonb, jsonb, jsonb)
  to authenticated;
