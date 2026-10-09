-- One tenant model for grocery and fruit shops. Existing stores remain grocery.
alter table public.stores add column business_type text not null default 'grocery'
  check (business_type in ('grocery', 'fruit_shop'));

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);
create unique index categories_store_name_key on public.categories (store_id, lower(btrim(name)));
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- The text category remains for old clients; category_id is the normalized link.
insert into public.categories (store_id, name)
select distinct store_id, btrim(category) from public.products
on conflict do nothing;
alter table public.products add column category_id uuid;
alter table public.products add constraint products_category_store_fk
  foreign key (store_id, category_id) references public.categories(store_id, id) on delete restrict;
-- The old deferred activation trigger would queue an event for every row in
-- this backfill. PostgreSQL cannot ALTER products while those events are pending.
drop trigger if exists products_guard_draft_activation on public.products;
update public.products p set category_id = c.id from public.categories c
  where p.store_id = c.store_id and lower(btrim(p.category)) = lower(btrim(c.name));

-- Product writes only occur through authorized RPCs. Keep legacy free-text callers
-- and catalog imports linked to the normalized store category automatically.
create or replace function public.assign_product_category()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.categories (store_id, name)
  values (new.store_id, btrim(new.category)) on conflict do nothing;
  select id into new.category_id from public.categories
    where store_id = new.store_id and lower(btrim(name)) = lower(btrim(new.category))
    limit 1;
  if new.category_id is null then raise exception 'Không thể xác định loại hàng.'; end if;
  return new;
end;
$$;
create trigger products_assign_category before insert or update of category, store_id
  on public.products for each row execute function public.assign_product_category();
alter table public.products alter column category_id set not null;

create table public.suppliers (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  address text check (address is null or char_length(address) <= 300),
  note text check (note is null or char_length(note) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);
create unique index suppliers_store_name_key on public.suppliers (store_id, lower(btrim(name)));
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.stock_receipts add column supplier_id uuid;
alter table public.stock_receipts add constraint stock_receipts_supplier_store_fk
  foreign key (store_id, supplier_id) references public.suppliers(store_id, id) on delete restrict;

-- Prepared for per-lot tracking. No automatic FIFO allocation is claimed yet.
create table public.product_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  receipt_id uuid,
  supplier_id uuid,
  received_at timestamptz not null default now(),
  quantity_received bigint not null check (quantity_received > 0),
  quantity_remaining bigint not null check (quantity_remaining between 0 and quantity_received),
  purchase_price bigint not null check (purchase_price between 0 and 999999999),
  purchase_unit text not null check (char_length(btrim(purchase_unit)) between 1 and 24),
  expiry_date date,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict,
  foreign key (store_id, receipt_id) references public.stock_receipts(store_id, id) on delete restrict,
  foreign key (store_id, supplier_id) references public.suppliers(store_id, id) on delete restrict
);
create index product_batches_product_received_idx
  on public.product_batches (store_id, product_id, received_at);

-- Existing integer stock is kept. Gram is the base unit for weighed fruit.
alter table public.products drop constraint products_product_group_check;
alter table public.products add constraint products_product_group_check
  check (product_group in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'fruit', 'other'));
alter table public.products drop constraint products_base_unit_check;
alter table public.products add constraint products_base_unit_check
  check (base_unit in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi'));
alter table public.product_units drop constraint product_units_unit_key_check;
alter table public.product_units add constraint product_units_unit_key_check
  check (unit_key ~ '^[a-z][a-z0-9_]{0,23}$');
alter table public.product_units drop constraint product_units_unit_name_check;
alter table public.product_units add constraint product_units_unit_name_check
  check (unit_name in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi'));
alter table public.product_units drop constraint product_units_check;
alter table public.product_units add constraint product_units_check
  check (can_purchase or can_sell or unit_key = 'base');

-- Quantity is exact decimal, while money remains whole VND and stock whole base units.
alter table public.sale_items drop constraint sale_items_check;
alter table public.sale_items drop constraint sale_items_check1;
alter table public.sale_items alter column quantity type numeric(14,3) using quantity::numeric(14,3);
alter table public.sale_items add constraint sale_items_base_quantity_exact
  check (base_quantity = quantity * factor_to_base);
alter table public.sale_items add constraint sale_items_line_total_rounded
  check (line_total = round(quantity * unit_price)::bigint);

alter table public.stock_movements add column client_request_id uuid;
alter table public.stock_movements add column adjustment_request_hash text;
alter table public.stock_movements add column adjustment_reason text
  check (adjustment_reason is null or adjustment_reason in
    ('damaged', 'spoiled', 'lost', 'inventory_correction', 'personal_use', 'other'));
create unique index stock_movements_adjustment_request_key
  on public.stock_movements (store_id, client_request_id)
  where movement_type = 'adjustment' and client_request_id is not null;

alter table public.sales add column request_hash text;
alter table public.stock_receipts add column request_hash text;
alter table public.debt_payments add column request_hash text;

alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.product_batches enable row level security;
create policy categories_select_member on public.categories for select to authenticated
  using ((select public.is_store_member(store_id)));
create policy suppliers_select_member on public.suppliers for select to authenticated
  using ((select public.is_store_member(store_id)));
create policy batches_select_member on public.product_batches for select to authenticated
  using ((select public.is_store_member(store_id)));
revoke all on public.categories, public.suppliers, public.product_batches from anon, authenticated;
grant select on public.categories, public.suppliers, public.product_batches to authenticated;

-- Store type is chosen on the server during onboarding. Keep the legacy one-arg RPC.
create or replace function public.create_store(p_name text, p_business_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_store uuid;
begin
  if v_user is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then
    raise exception 'Tên cửa hàng chưa hợp lệ.';
  end if;
  if p_business_type is null or p_business_type not in ('grocery', 'fruit_shop') then
    raise exception 'Loại cửa hàng chưa hợp lệ.';
  end if;
  insert into public.stores (name, business_type, created_by)
  values (btrim(p_name), p_business_type, v_user) returning id into v_store;
  insert into public.store_members (store_id, user_id, role)
  values (v_store, v_user, 'owner');
  return v_store;
end;
$$;

create or replace function public.create_store(p_name text)
returns uuid language sql security definer set search_path = '' as $$
  select public.create_store(p_name, 'grocery');
$$;

revoke all on function public.create_store(text, text) from public, anon;
grant execute on function public.create_store(text, text) to authenticated;

-- Do not allow clients to rewrite created_by/business_type through a broad table grant.
revoke update on public.stores from authenticated;
grant update (name, timezone) on public.stores to authenticated;

create or replace function public.save_category(
  p_store_id uuid,
  p_name text,
  p_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được quản lý loại hàng.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Tên loại hàng chưa hợp lệ.';
  end if;
  if p_category_id is null then
    insert into public.categories (store_id, name) values (p_store_id, btrim(p_name))
      returning id into v_id;
    update public.products set category_id = v_id
      where store_id = p_store_id and category_id is null
        and lower(btrim(category)) = lower(btrim(p_name));
  else
    update public.categories set name = btrim(p_name)
      where store_id = p_store_id and id = p_category_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy loại hàng.'; end if;
    update public.products set category = btrim(p_name), version = version + 1
      where store_id = p_store_id and category_id = v_id;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user,
    case when p_category_id is null then 'category.created' else 'category.updated' end,
    'category', v_id);
  return v_id;
end;
$$;
revoke all on function public.save_category(uuid, text, uuid) from public, anon;
grant execute on function public.save_category(uuid, text, uuid) to authenticated;

create or replace function public.save_supplier(
  p_store_id uuid,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_note text default null,
  p_supplier_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được quản lý nhà cung cấp.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
    or char_length(coalesce(p_phone, '')) > 30
    or char_length(coalesce(p_address, '')) > 300
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Thông tin nhà cung cấp chưa hợp lệ.';
  end if;
  if p_supplier_id is null then
    insert into public.suppliers (store_id, name, phone, address, note)
    values (p_store_id, btrim(p_name), nullif(btrim(p_phone), ''),
      nullif(btrim(p_address), ''), nullif(btrim(p_note), '')) returning id into v_id;
  else
    update public.suppliers set name = btrim(p_name), phone = nullif(btrim(p_phone), ''),
      address = nullif(btrim(p_address), ''), note = nullif(btrim(p_note), '')
      where store_id = p_store_id and id = p_supplier_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy nhà cung cấp.'; end if;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user,
    case when p_supplier_id is null then 'supplier.created' else 'supplier.updated' end,
    'supplier', v_id);
  return v_id;
end;
$$;
revoke all on function public.save_supplier(uuid, text, text, text, text, uuid) from public, anon;
grant execute on function public.save_supplier(uuid, text, text, text, text, uuid) to authenticated;

create or replace function public.adjust_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity_base bigint,
  p_reason text,
  p_request_id uuid,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_existing public.stock_movements%rowtype;
  v_product public.products%rowtype;
  v_new_balance numeric;
  v_movement uuid;
  v_hash text;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được điều chỉnh tồn kho.';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_quantity_base is null or p_quantity_base = 0
    or p_quantity_base::numeric not between -999999999999 and 999999999999 then
    raise exception 'Số lượng điều chỉnh chưa hợp lệ.';
  end if;
  if p_reason is null or p_reason not in
    ('damaged', 'spoiled', 'lost', 'inventory_correction', 'personal_use', 'other') then
    raise exception 'Lý do điều chỉnh chưa hợp lệ.';
  end if;
  if p_reason in ('damaged', 'spoiled', 'lost', 'personal_use') and p_quantity_base > 0 then
    raise exception 'Hàng hư hoặc hao hụt phải trừ tồn kho.';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'product_id', p_product_id, 'quantity_base', p_quantity_base,
    'reason', p_reason, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_movements
    where store_id = p_store_id and movement_type = 'adjustment' and client_request_id = p_request_id;
  if found then
    if v_existing.adjustment_request_hash is distinct from v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho một điều chỉnh khác.';
    end if;
    return jsonb_build_object('movement_id', v_existing.id,
      'balance_after', v_existing.balance_after, 'duplicate', true);
  end if;

  select * into v_product from public.products
    where store_id = p_store_id and id = p_product_id for update;
  if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
  v_new_balance := v_product.stock_base::numeric + p_quantity_base::numeric;
  if v_new_balance < 0 then raise exception 'Không đủ hàng để trừ tồn kho.'; end if;
  if v_new_balance > 9223372036854775807 then raise exception 'Tồn kho vượt giới hạn.'; end if;
  update public.products set stock_base = v_new_balance::bigint, version = version + 1
    where id = p_product_id and store_id = p_store_id;
  insert into public.stock_movements (store_id, product_id, movement_type,
    quantity_base, balance_after, client_request_id, adjustment_request_hash,
    adjustment_reason, reason, created_by)
  values (p_store_id, p_product_id, 'adjustment', p_quantity_base,
    v_new_balance::bigint, p_request_id, v_hash, p_reason, nullif(btrim(p_note), ''), v_user)
  returning id into v_movement;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.adjusted', 'stock_movement', v_movement,
    jsonb_build_object('product_id', p_product_id, 'quantity_base', p_quantity_base,
      'reason', p_reason, 'balance_after', v_new_balance::bigint));
  return jsonb_build_object('movement_id', v_movement,
    'balance_after', v_new_balance::bigint, 'duplicate', false);
end;
$$;
revoke all on function public.adjust_stock(uuid, uuid, bigint, text, uuid, text) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, bigint, text, uuid, text) to authenticated;

-- Optional supplier association without changing the existing four-argument call.
create or replace function public.receive_stock(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_note text,
  p_supplier_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_existing_supplier uuid;
begin
  if auth.uid() is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where store_id = p_store_id and id = p_supplier_id and is_active
  ) then raise exception 'Không tìm thấy nhà cung cấp.'; end if;
  v_result := public.receive_stock(p_store_id, p_request_id, p_items, p_note);
  if (v_result ->> 'duplicate')::boolean then
    select supplier_id into v_existing_supplier from public.stock_receipts
      where id = (v_result ->> 'receipt_id')::uuid and store_id = p_store_id;
    if v_existing_supplier is distinct from p_supplier_id then
      raise exception 'Mã yêu cầu đã được dùng với nhà cung cấp khác.';
    end if;
  else
    update public.stock_receipts set supplier_id = p_supplier_id
      where id = (v_result ->> 'receipt_id')::uuid and store_id = p_store_id;
  end if;
  return v_result;
end;
$$;
revoke all on function public.receive_stock(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, jsonb, text, uuid) to authenticated;

-- Updated transactional RPCs preserve old signatures and grocery behavior.

alter table public.stock_receipt_items add constraint stock_receipt_items_base_exact
  check (base_quantity = quantity * factor_to_base);

create or replace function public.guard_draft_activation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.is_active = false and new.is_active = true
    and not exists (
    select 1 from public.product_units u
    where u.store_id = new.store_id and u.product_id = new.id and u.can_sell and u.sale_price > 0
  ) then
    raise exception 'Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.';
  end if;
  return null;
end;
$$;
create constraint trigger products_guard_draft_activation after update on public.products
  deferrable initially deferred for each row execute function public.guard_draft_activation();

create or replace function public.save_product(
  p_store_id uuid,
  p_name text,
  p_category text,
  p_product_group text,
  p_base_unit text,
  p_units jsonb,
  p_opening_stock bigint default 0,
  p_low_stock_threshold bigint default 5,
  p_is_active boolean default true,
  p_product_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_old public.products%rowtype;
  v_unit jsonb;
  v_key text;
  v_name text;
  v_factor bigint;
  v_purchase bigint;
  v_sale bigint;
  v_can_purchase boolean;
  v_can_sell boolean;
  v_category_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80 then raise exception 'Tên hoặc nhóm hiển thị chưa hợp lệ.'; end if;
  if p_product_group is null or p_product_group not in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'fruit', 'other') then raise exception 'Nhóm hàng chưa hợp lệ.'; end if;
  if p_base_unit is null or p_base_unit not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi') then raise exception 'Đơn vị tồn kho chưa hợp lệ.'; end if;
  if p_opening_stock < 0 or p_low_stock_threshold < 0 then raise exception 'Số lượng không được âm.'; end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' then raise exception 'Danh sách đơn vị chưa hợp lệ.'; end if;
  if jsonb_array_length(p_units) not between 1 and 8 then raise exception 'Mặt hàng cần từ 1 đến 8 đơn vị.'; end if;
  if p_product_group = 'fruit' and exists (
    select 1 from jsonb_array_elements(p_units) u
    where u.value ->> 'name' in ('kg', 'gram', 'lạng')
  ) and p_base_unit <> 'gram' then
    raise exception 'Trái cây bán theo cân phải dùng gram làm đơn vị tồn kho.';
  end if;
  if (select count(*) from (select distinct value ->> 'key' from jsonb_array_elements(p_units)) x) <> jsonb_array_length(p_units) then raise exception 'Đơn vị bị trùng.'; end if;
  if not exists (select 1 from jsonb_array_elements(p_units) where value ->> 'key' = 'base') then raise exception 'Thiếu đơn vị gốc.'; end if;
  select id into v_category_id from public.categories
    where store_id = p_store_id and lower(btrim(name)) = lower(btrim(p_category)) limit 1;

  if p_product_id is null then
    insert into public.products (store_id, name, category, category_id, product_group, base_unit, stock_base, low_stock_threshold, is_active)
    values (p_store_id, btrim(p_name), btrim(p_category), v_category_id, p_product_group, p_base_unit, p_opening_stock, p_low_stock_threshold, p_is_active)
    returning id into v_id;
  else
    select * into v_old from public.products where store_id = p_store_id and id = p_product_id for update;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if v_old.stock_base > 0 and v_old.base_unit <> p_base_unit then raise exception 'Mặt hàng còn tồn kho nên chưa thể đổi đơn vị nhỏ nhất.'; end if;
    v_id := v_old.id;
    update public.products set name = btrim(p_name), category = btrim(p_category), category_id = v_category_id, product_group = p_product_group,
      base_unit = p_base_unit, low_stock_threshold = p_low_stock_threshold, is_active = p_is_active, version = version + 1
    where id = v_id;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units) loop
    begin
      v_key := v_unit ->> 'key'; v_name := v_unit ->> 'name'; v_factor := (v_unit ->> 'factor')::bigint;
      v_purchase := nullif(v_unit ->> 'purchase_price', '')::bigint; v_sale := nullif(v_unit ->> 'sale_price', '')::bigint;
      v_can_purchase := coalesce((v_unit ->> 'can_purchase')::boolean, false); v_can_sell := coalesce((v_unit ->> 'can_sell')::boolean, false);
    exception when others then raise exception 'Thông tin đơn vị chưa hợp lệ.'; end;
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,23}$' or v_name not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi') or v_factor <= 0 then raise exception 'Tên hoặc hệ số đơn vị chưa hợp lệ.'; end if;
    if p_product_group = 'fruit' and (
      (v_name = 'kg' and v_factor <> 1000)
      or (v_name = 'lạng' and v_factor <> 100)
      or (v_name = 'gram' and v_factor <> 1)
    ) then raise exception 'Quy đổi kg, lạng, gram chưa chính xác.'; end if;
    if (v_purchase is not null and v_purchase not between 0 and 999999999) or (v_sale is not null and v_sale not between 0 and 999999999) then raise exception 'Giá vượt giới hạn.'; end if;
    if (v_can_purchase and v_purchase is null) or (v_can_sell and v_sale is null) or (not (v_can_purchase or v_can_sell) and (p_product_group <> 'fruit' or v_key <> 'base')) then
      raise exception 'Mỗi đơn vị giao dịch cần giá phù hợp; gram gốc có thể chỉ dùng để đo tồn kho.';
    end if;

    if p_product_id is not null and v_old.stock_base > 0 and exists (
      select 1 from public.product_units where store_id = p_store_id and product_id = v_id and unit_key = v_key
        and (factor_to_base <> v_factor or unit_name <> v_name)
    ) then raise exception 'Mặt hàng còn tồn kho nên chưa thể đổi quy cách.'; end if;

    insert into public.product_units (store_id, product_id, unit_key, unit_name, factor_to_base, purchase_price, sale_price, can_purchase, can_sell)
    values (p_store_id, v_id, v_key, v_name, v_factor, v_purchase, v_sale, v_can_purchase, v_can_sell)
    on conflict (store_id, product_id, unit_key) do update set unit_name = excluded.unit_name, factor_to_base = excluded.factor_to_base,
      purchase_price = excluded.purchase_price, sale_price = excluded.sale_price, can_purchase = excluded.can_purchase, can_sell = excluded.can_sell;
  end loop;

  if p_product_id is not null and v_old.stock_base > 0 and exists (
    select 1 from public.product_units u where u.store_id = p_store_id and u.product_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_units) x where x.value ->> 'key' = u.unit_key)
  ) then raise exception 'Mặt hàng còn tồn kho nên chưa thể bỏ quy cách.'; end if;
  delete from public.product_units u where u.store_id = p_store_id and u.product_id = v_id
    and not exists (select 1 from jsonb_array_elements(p_units) x where x.value ->> 'key' = u.unit_key);

  if p_product_group = 'fruit' and p_is_active and not exists (
    select 1 from public.product_units
    where store_id = p_store_id and product_id = v_id and can_sell and sale_price > 0
  ) then raise exception 'Trái cây đang bán cần ít nhất một đơn vị có giá bán.'; end if;

  if p_product_id is null and p_opening_stock > 0 then
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, reason, created_by)
    values (p_store_id, v_id, 'opening', p_opening_stock, p_opening_stock, 'Tồn kho ban đầu', v_user);
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user, case when p_product_id is null then 'product.created' else 'product.updated' end, 'product', v_id);
  return v_id;
end;
$$;

create or replace function public.receive_stock(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_receipt uuid;
  v_existing public.stock_receipts%rowtype;
  v_hash text;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric;
  v_base_numeric numeric;
  v_base_quantity bigint;
  v_unit_cost bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Danh sách nhập hàng phải có từ 1 đến 500 dòng.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_receipts where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho phiếu nhập khác.';
    end if;
    return jsonb_build_object('receipt_id', v_existing.id, 'duplicate', true);
  end if;

  -- Lock products in a stable order to prevent overselling/deadlocks against other commands.
  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.stock_receipts (store_id, client_request_id, note, created_by, request_hash)
  values (p_store_id, p_request_id, nullif(btrim(p_note), ''), v_user, v_hash) returning id into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_unit_cost := (v_item ->> 'unit_cost')::bigint;
    exception when others then raise exception 'Số lượng hoặc giá nhập chưa hợp lệ.'; end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999
      or v_quantity <> trunc(v_quantity, 3)
      or v_unit_cost is null or v_unit_cost < 0 or v_unit_cost > 999999999 then raise exception 'Số lượng hoặc giá nhập vượt giới hạn.'; end if;

    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid and is_active for update;
    if not found then raise exception 'Không tìm thấy mặt hàng đang bán.'; end if;
    select * into v_unit from public.product_units
      where store_id = p_store_id and product_id = v_product.id and unit_key = (v_item ->> 'unit_key') and can_purchase;
    if not found then raise exception 'Đơn vị nhập của % chưa hợp lệ.', v_product.name; end if;

    v_base_numeric := v_quantity * v_unit.factor_to_base;
    if v_base_numeric <> trunc(v_base_numeric) then raise exception 'Số lượng % chưa quy đổi thành đơn vị kho nguyên.', v_product.name; end if;
    v_base_quantity := v_base_numeric::bigint;
    v_line_total := round(v_quantity * v_unit_cost)::bigint;

    begin
      insert into public.stock_receipt_items (store_id, receipt_id, product_id, unit_key, unit_name, quantity, factor_to_base, base_quantity, unit_cost, line_total)
      values (p_store_id, v_receipt, v_product.id, v_unit.unit_key, v_unit.unit_name, v_quantity, v_unit.factor_to_base, v_base_quantity, v_unit_cost, v_line_total);
    exception when unique_violation then raise exception 'Một mặt hàng và đơn vị chỉ được xuất hiện một lần trong phiếu nhập.'; end;

    update public.products set stock_base = stock_base + v_base_quantity, version = version + 1 where id = v_product.id returning stock_base into v_product.stock_base;
    update public.product_units set purchase_price = v_unit_cost where id = v_unit.id;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, receipt_id, created_by)
    values (p_store_id, v_product.id, 'purchase', v_base_quantity, v_product.stock_base, v_receipt, v_user);
    v_total := v_total + v_line_total;
  end loop;

  update public.stock_receipts set total_cost = v_total where id = v_receipt;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.received', 'stock_receipt', v_receipt, jsonb_build_object('total_cost', v_total, 'line_count', jsonb_array_length(p_items)));
  return jsonb_build_object('receipt_id', v_receipt, 'total_cost', v_total, 'duplicate', false);
end;
$$;

create or replace function public.create_sale(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_payment_type text default 'cash',
  p_customer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sale uuid;
  v_existing public.sales%rowtype;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric;
  v_base_numeric numeric;
  v_hash text;
  v_base_quantity bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_payment_type not in ('cash', 'credit') then raise exception 'Hình thức thanh toán chưa hợp lệ.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Giỏ hàng phải có từ 1 đến 200 dòng.'; end if;
  if p_payment_type = 'credit' then
    perform 1 from public.customers where store_id = p_store_id and id = p_customer_id for update;
    if not found then raise exception 'Không tìm thấy khách mua chịu.'; end if;
  end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'payment_type', p_payment_type, 'customer_id', p_customer_id
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.sales where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho đơn bán khác.';
    end if;
    return jsonb_build_object('sale_id', v_existing.id, 'total_amount', v_existing.total_amount, 'duplicate', true);
  end if;

  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.sales (store_id, customer_id, payment_type, client_request_id, created_by, request_hash)
  values (p_store_id, case when p_payment_type = 'credit' then p_customer_id else null end, p_payment_type, p_request_id, v_user, v_hash)
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then raise exception 'Số lượng bán chưa hợp lệ.'; end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999 or v_quantity <> trunc(v_quantity, 3) then
      raise exception 'Số lượng bán phải lớn hơn 0 và tối đa 3 số lẻ.';
    end if;

    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid and is_active for update;
    if not found then raise exception 'Không tìm thấy mặt hàng đang bán.'; end if;
    select * into v_unit from public.product_units
      where store_id = p_store_id and product_id = v_product.id and unit_key = (v_item ->> 'unit_key') and can_sell;
    if not found then raise exception 'Đơn vị bán của % chưa hợp lệ.', v_product.name; end if;

    v_base_numeric := v_quantity * v_unit.factor_to_base;
    if v_base_numeric <> trunc(v_base_numeric) then
      raise exception 'Số lượng % chưa quy đổi thành đơn vị kho nguyên.', v_product.name;
    end if;
    v_base_quantity := v_base_numeric::bigint;
    if v_product.stock_base < v_base_quantity then raise exception 'Không đủ hàng % trong kho.', v_product.name; end if;
    v_line_total := round(v_quantity * v_unit.sale_price)::bigint;

    begin
      insert into public.sale_items (store_id, sale_id, product_id, product_name, unit_key, unit_name, quantity, factor_to_base, base_quantity, unit_price, line_total)
      values (p_store_id, v_sale, v_product.id, v_product.name, v_unit.unit_key, v_unit.unit_name, v_quantity, v_unit.factor_to_base, v_base_quantity, v_unit.sale_price, v_line_total);
    exception when unique_violation then raise exception 'Một mặt hàng và đơn vị chỉ được xuất hiện một lần trong giỏ.'; end;

    update public.products set stock_base = stock_base - v_base_quantity, version = version + 1 where id = v_product.id returning stock_base into v_product.stock_base;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, sale_id, created_by)
    values (p_store_id, v_product.id, 'sale', -v_base_quantity, v_product.stock_base, v_sale, v_user);
    v_total := v_total + v_line_total;
  end loop;

  update public.sales set total_amount = v_total, outstanding_amount = case when p_payment_type = 'credit' then v_total else 0 end where id = v_sale;
  if p_payment_type = 'credit' then
    update public.customers set current_debt = current_debt + v_total, is_in_debt_book = true, last_transaction_at = now() where id = p_customer_id;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'sale.created', 'sale', v_sale, jsonb_build_object('payment_type', p_payment_type, 'total_amount', v_total));
  return jsonb_build_object('sale_id', v_sale, 'total_amount', v_total, 'duplicate', false);
end;
$$;

create or replace function public.record_debt_payment(
  p_store_id uuid,
  p_customer_id uuid,
  p_amount bigint,
  p_request_id uuid,
  p_payment_method text default 'cash',
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payment uuid;
  v_existing public.debt_payments%rowtype;
  v_customer public.customers%rowtype;
  v_sale public.sales%rowtype;
  v_remaining bigint := p_amount;
  v_applied bigint;
  v_hash text;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Số tiền trả phải lớn hơn 0.'; end if;
  if p_payment_method not in ('cash', 'bank', 'other') then raise exception 'Cách nhận tiền chưa hợp lệ.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'customer_id', p_customer_id, 'amount', p_amount,
    'payment_method', p_payment_method, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.debt_payments where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho khoản trả nợ khác.';
    end if;
    return jsonb_build_object('payment_id', v_existing.id,
      'remaining_debt', (select current_debt from public.customers where id = v_existing.customer_id), 'duplicate', true);
  end if;

  select * into v_customer from public.customers where store_id = p_store_id and id = p_customer_id for update;
  if not found then raise exception 'Không tìm thấy khách.'; end if;
  if p_amount > v_customer.current_debt then raise exception 'Số tiền trả vượt quá số nợ hiện tại.'; end if;

  insert into public.debt_payments (store_id, customer_id, amount, payment_method, note, client_request_id, created_by, request_hash)
  values (p_store_id, p_customer_id, p_amount, p_payment_method, nullif(btrim(p_note), ''), p_request_id, v_user, v_hash) returning id into v_payment;

  for v_sale in select * from public.sales
    where store_id = p_store_id and customer_id = p_customer_id and payment_type = 'credit' and status = 'completed' and outstanding_amount > 0
    order by created_at, id for update
  loop
    exit when v_remaining = 0;
    v_applied := least(v_remaining, v_sale.outstanding_amount);
    insert into public.payment_allocations (payment_id, sale_id, store_id, amount) values (v_payment, v_sale.id, p_store_id, v_applied);
    update public.sales set outstanding_amount = outstanding_amount - v_applied where id = v_sale.id;
    v_remaining := v_remaining - v_applied;
  end loop;
  if v_remaining <> 0 then raise exception 'Lịch sử nợ chưa khớp số dư khách.'; end if;

  update public.customers
    set current_debt = current_debt - p_amount, is_in_debt_book = (current_debt - p_amount > 0), last_transaction_at = now()
    where id = p_customer_id returning * into v_customer;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'debt.payment_recorded', 'debt_payment', v_payment, jsonb_build_object('amount', p_amount, 'remaining_debt', v_customer.current_debt));
  return jsonb_build_object('payment_id', v_payment, 'remaining_debt', v_customer.current_debt, 'duplicate', false);
end;
$$;

create or replace function public.cancel_sale(
  p_store_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_balance bigint;
  v_refund bigint;
  v_debt_reduction bigint;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then raise exception 'Lý do hủy phải có từ 1 đến 300 ký tự.'; end if;
  select * into v_sale from public.sales where store_id = p_store_id and id = p_sale_id;
  if not found then raise exception 'Không tìm thấy đơn bán hàng.'; end if;
  if v_sale.customer_id is not null then
    perform 1 from public.customers where id = v_sale.customer_id and store_id = p_store_id for update;
  end if;
  -- Payments also lock customer before sale rows. Keep the same order to avoid deadlocks.
  select * into v_sale from public.sales where store_id = p_store_id and id = p_sale_id for update;
  if v_sale.status = 'cancelled' then raise exception 'Đơn này đã hủy.'; end if;
  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then raise exception 'Đơn không có chi tiết mặt hàng để hoàn kho.'; end if;

  v_debt_reduction := case when v_sale.payment_type = 'credit' then v_sale.outstanding_amount else 0 end;
  v_refund := v_sale.total_amount - v_debt_reduction;

  if v_sale.customer_id is not null then
    if v_debt_reduction > 0 then
      update public.customers
        set current_debt = current_debt - v_debt_reduction,
            is_in_debt_book = (current_debt - v_debt_reduction > 0), last_transaction_at = now()
        where id = v_sale.customer_id and current_debt >= v_debt_reduction;
      if not found then raise exception 'Số dư nợ của khách không khớp lịch sử.'; end if;
    end if;
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id order by product_id for update loop
    update public.products set stock_base = stock_base + v_item.base_quantity, version = version + 1
      where id = v_item.product_id and store_id = p_store_id returning stock_base into v_balance;
    if not found then raise exception 'Không tìm thấy mặt hàng để hoàn kho.'; end if;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, sale_id, reason, created_by)
    values (p_store_id, v_item.product_id, 'sale_cancel', v_item.base_quantity, v_balance, p_sale_id, btrim(p_reason), v_user);
  end loop;

  update public.sales set status = 'cancelled', outstanding_amount = 0, cancelled_at = now(), cancellation_reason = btrim(p_reason), refund_amount = v_refund, debt_reduction = v_debt_reduction where id = p_sale_id;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'sale.cancelled', 'sale', p_sale_id, jsonb_build_object('reason', btrim(p_reason), 'refund_amount', v_refund, 'debt_reduction', v_debt_reduction));
  return jsonb_build_object('sale_id', p_sale_id, 'refund_amount', v_refund, 'debt_reduction', v_debt_reduction);
end;
$$;

create or replace view public.product_catalog with (security_invoker = true) as
select p.id, p.store_id, p.name, p.category, p.product_group, p.base_unit, p.stock_base,
  p.low_stock_threshold, p.is_active, p.version, p.created_at, p.updated_at,
  coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'key', u.unit_key, 'name', u.unit_name, 'factor', u.factor_to_base,
    'purchase_price', u.purchase_price, 'sale_price', u.sale_price,
    'can_purchase', u.can_purchase, 'can_sell', u.can_sell
  ) order by u.factor_to_base) filter (where u.id is not null), '[]'::jsonb) units, p.category_id
from public.products p left join public.product_units u on u.product_id = p.id and u.store_id = p.store_id
group by p.id;
