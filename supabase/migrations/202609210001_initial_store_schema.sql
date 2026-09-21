-- Tạp hóa BIN: relational schema, tenant isolation and audit foundations.
-- Money is stored as whole VND (bigint). Inventory is stored in the smallest sale unit.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  currency text not null default 'VND' check (currency = 'VND'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text not null default 'Hàng khác' check (char_length(btrim(category)) between 1 and 80),
  product_group text not null default 'other' check (product_group in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'other')),
  base_unit text not null check (base_unit in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên')),
  stock_base bigint not null default 0 check (stock_base >= 0),
  low_stock_threshold bigint not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);

create unique index products_store_name_active_key
  on public.products (store_id, lower(btrim(name))) where is_active;
create index products_store_stock_idx on public.products (store_id, stock_base) where is_active;

create table public.product_units (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  unit_key text not null check (unit_key in ('base', 'bag', 'pack')),
  unit_name text not null check (unit_name in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên')),
  factor_to_base bigint not null check (factor_to_base > 0),
  purchase_price bigint check (purchase_price between 0 and 999999999),
  sale_price bigint check (sale_price between 0 and 999999999),
  can_purchase boolean not null default false,
  can_sell boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, product_id, unit_key),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete cascade,
  check (can_purchase or can_sell),
  check (not can_purchase or purchase_price is not null),
  check (not can_sell or sale_price is not null)
);

create table public.customers (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phone text check (phone is null or char_length(phone) <= 30),
  note text check (note is null or char_length(note) <= 500),
  current_debt bigint not null default 0 check (current_debt >= 0),
  is_in_debt_book boolean not null default false,
  last_transaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (current_debt > 0 or not is_in_debt_book)
);

create index customers_debt_book_idx on public.customers (store_id, last_transaction_at desc)
  where is_in_debt_book;

create table public.sales (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  customer_id uuid,
  payment_type text not null check (payment_type in ('cash', 'credit')),
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  total_amount bigint not null default 0 check (total_amount >= 0),
  outstanding_amount bigint not null default 0 check (outstanding_amount >= 0 and outstanding_amount <= total_amount),
  client_request_id uuid not null,
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(btrim(cancellation_reason)) between 1 and 300),
  refund_amount bigint check (refund_amount is null or refund_amount >= 0),
  debt_reduction bigint check (debt_reduction is null or debt_reduction >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id),
  foreign key (store_id, customer_id) references public.customers(store_id, id) on delete restrict,
  check ((payment_type = 'credit' and customer_id is not null) or payment_type = 'cash'),
  check ((status = 'completed' and cancelled_at is null) or (status = 'cancelled' and cancelled_at is not null)),
  check (coalesce(refund_amount, 0) + coalesce(debt_reduction, 0) <= total_amount)
);

create index sales_store_created_idx on public.sales (store_id, created_at desc);
create index sales_customer_outstanding_idx on public.sales (customer_id, created_at)
  where payment_type = 'credit' and status = 'completed' and outstanding_amount > 0;

create table public.sale_items (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  unit_key text not null,
  unit_name text not null,
  quantity bigint not null check (quantity > 0),
  factor_to_base bigint not null check (factor_to_base > 0),
  base_quantity bigint not null check (base_quantity > 0),
  unit_price bigint not null check (unit_price between 0 and 999999999),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (sale_id, product_id, unit_key),
  foreign key (store_id, sale_id) references public.sales(store_id, id) on delete restrict,
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict,
  check (base_quantity = quantity * factor_to_base),
  check (line_total = quantity * unit_price)
);

create table public.stock_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  client_request_id uuid not null,
  note text check (note is null or char_length(note) <= 500),
  total_cost bigint not null default 0 check (total_cost >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id)
);

create table public.stock_receipt_items (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  receipt_id uuid not null,
  product_id uuid not null,
  unit_key text not null,
  unit_name text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  factor_to_base bigint not null check (factor_to_base > 0),
  base_quantity bigint not null check (base_quantity > 0),
  unit_cost bigint not null check (unit_cost between 0 and 999999999),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (receipt_id, product_id, unit_key),
  foreign key (store_id, receipt_id) references public.stock_receipts(store_id, id) on delete restrict,
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);

create table public.stock_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('opening', 'purchase', 'sale', 'sale_cancel', 'adjustment')),
  quantity_base bigint not null check (quantity_base <> 0),
  balance_after bigint not null check (balance_after >= 0),
  sale_id uuid,
  receipt_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict,
  foreign key (store_id, sale_id) references public.sales(store_id, id) on delete restrict,
  foreign key (store_id, receipt_id) references public.stock_receipts(store_id, id) on delete restrict,
  check (
    (movement_type in ('sale', 'sale_cancel') and sale_id is not null and receipt_id is null)
    or (movement_type = 'purchase' and receipt_id is not null and sale_id is null)
    or (movement_type in ('opening', 'adjustment') and sale_id is null and receipt_id is null)
  )
);

create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

create table public.debt_payments (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  amount bigint not null check (amount > 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'bank', 'other')),
  note text check (note is null or char_length(note) <= 500),
  client_request_id uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id),
  foreign key (store_id, customer_id) references public.customers(store_id, id) on delete restrict
);

create table public.payment_allocations (
  payment_id uuid not null,
  sale_id uuid not null,
  store_id uuid not null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (payment_id, sale_id),
  foreign key (store_id, payment_id) references public.debt_payments(store_id, id) on delete restrict,
  foreign key (store_id, sale_id) references public.sales(store_id, id) on delete restrict
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_store_created_idx on public.audit_logs (store_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger stores_set_updated_at before update on public.stores
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger product_units_set_updated_at before update on public.product_units
  for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

create or replace function public.validate_product_unit()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_base_unit text;
begin
  select base_unit into v_base_unit
  from public.products where store_id = new.store_id and id = new.product_id;
  if v_base_unit is null then raise exception 'Không tìm thấy mặt hàng.'; end if;
  if new.unit_key = 'base' and (new.factor_to_base <> 1 or new.unit_name <> v_base_unit) then
    raise exception 'Đơn vị bán lẻ phải có hệ số 1 và khớp mặt hàng.';
  end if;
  return new;
end;
$$;

create trigger product_units_validate before insert or update on public.product_units
  for each row execute function public.validate_product_unit();

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members
    where store_id = p_store_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, 'Chủ tiệm'), '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.create_store(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_store uuid;
begin
  if v_user is null then raise exception 'Bạn cần đăng nhập.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Tên cửa hàng chưa hợp lệ.'; end if;
  insert into public.stores (name, created_by) values (btrim(p_name), v_user) returning id into v_store;
  insert into public.store_members (store_id, user_id, role) values (v_store, v_user, 'owner');
  return v_store;
end;
$$;

-- Every exposed table is protected. Transaction tables are read-only to clients;
-- stock, sales and debts can only change through the RPC functions in the next migration.
alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_members enable row level security;
alter table public.products enable row level security;
alter table public.product_units enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_receipts enable row level security;
alter table public.stock_receipt_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.debt_payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy stores_select_member on public.stores for select to authenticated using ((select public.is_store_member(id)));
create policy stores_update_owner on public.stores for update to authenticated using ((select public.is_store_owner(id))) with check ((select public.is_store_owner(id)));
create policy members_select_member on public.store_members for select to authenticated using ((select public.is_store_member(store_id)));

create policy products_select_member on public.products for select to authenticated using ((select public.is_store_member(store_id)));
create policy product_units_select_member on public.product_units for select to authenticated using ((select public.is_store_member(store_id)));
create policy customers_select_member on public.customers for select to authenticated using ((select public.is_store_member(store_id)));

create policy sales_select_member on public.sales for select to authenticated using ((select public.is_store_member(store_id)));
create policy sale_items_select_member on public.sale_items for select to authenticated using ((select public.is_store_member(store_id)));
create policy receipts_select_member on public.stock_receipts for select to authenticated using ((select public.is_store_member(store_id)));
create policy receipt_items_select_member on public.stock_receipt_items for select to authenticated using ((select public.is_store_member(store_id)));
create policy stock_movements_select_member on public.stock_movements for select to authenticated using ((select public.is_store_member(store_id)));
create policy payments_select_member on public.debt_payments for select to authenticated using ((select public.is_store_member(store_id)));
create policy allocations_select_member on public.payment_allocations for select to authenticated using ((select public.is_store_member(store_id)));
create policy audit_select_member on public.audit_logs for select to authenticated using ((select public.is_store_member(store_id)));

revoke all on all tables in schema public from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.stores to authenticated;
grant select on public.store_members to authenticated;
grant select on public.products, public.product_units, public.customers to authenticated;
grant select on public.sales, public.sale_items, public.stock_receipts, public.stock_receipt_items,
  public.stock_movements, public.debt_payments, public.payment_allocations, public.audit_logs to authenticated;

revoke all on function public.is_store_member(uuid), public.is_store_owner(uuid), public.create_store(text) from public, anon;
grant execute on function public.is_store_member(uuid), public.is_store_owner(uuid), public.create_store(text) to authenticated;
