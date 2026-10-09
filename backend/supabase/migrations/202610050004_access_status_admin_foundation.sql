-- Account, membership and shop lifecycle. Keep suspended shops readable to active
-- members, but serialize every business write against a concurrent suspension.
alter table public.profiles add column account_status text not null default 'active'
  check (account_status in ('active', 'disabled'));
alter table public.stores add column status text not null default 'active'
  check (status in ('active', 'suspended', 'archived'));
alter table public.store_members add column is_active boolean not null default true;
create index store_members_active_user_idx on public.store_members (user_id, store_id)
  where is_active;
create index stores_status_created_idx on public.stores (status, created_at desc);

-- A self-service profile edit must never be able to re-enable an account.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
drop policy stores_update_owner on public.stores;
create policy stores_update_owner on public.stores for update to authenticated
  using ((select public.is_store_owner(id)) and status = 'active')
  with check ((select public.is_store_owner(id)) and status = 'active');

create or replace function public.is_store_member(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members m
    join public.profiles p on p.id = m.user_id
    where m.store_id = p_store_id and m.user_id = (select auth.uid())
      and m.is_active and p.account_status = 'active'
  );
$$;

create or replace function public.is_store_owner(p_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members m
    join public.profiles p on p.id = m.user_id
    where m.store_id = p_store_id and m.user_id = (select auth.uid())
      and m.role = 'owner' and m.is_active and p.account_status = 'active'
  );
$$;

-- Every exposed business mutation, including a direct RPC call from an old tab,
-- reaches this trigger. FOR SHARE prevents a sale from committing after a
-- concurrent shop suspension commits; the two operations serialize.
create or replace function public.guard_store_business_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_store_id uuid;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_store_id := old.store_id;
  else
    v_store_id := new.store_id;
  end if;
  if tg_op = 'UPDATE' and new.store_id is distinct from old.store_id then
    raise exception 'Không thể chuyển dữ liệu sang cửa hàng khác.' using errcode = '42501';
  end if;
  -- Seed/migrations run through a trusted direct postgres session. A request
  -- role (authenticated or service_role) never uses this bypass.
  if session_user = 'postgres' and current_setting('role', true) in ('none', 'postgres')
    and auth.uid() is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if auth.uid() is null or not public.is_store_member(v_store_id) then
    raise exception 'Bạn không còn quyền ghi dữ liệu cửa hàng này.' using errcode = '42501';
  end if;
  select status into v_status from public.stores where id = v_store_id for share;
  if v_status is distinct from 'active' then
    raise exception 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'categories', 'suppliers', 'products', 'product_units', 'customers',
    'sales', 'sale_items', 'stock_receipts', 'stock_receipt_items',
    'stock_movements', 'debt_payments', 'payment_allocations', 'audit_logs',
    'product_batches', 'catalog_import_batches', 'product_source_quotes',
    'inventory_counts', 'inventory_count_items',
    'inventory_adjustment_valuations', 'opening_cost_valuations',
    'legacy_import_batches'
  ] loop
    execute format('create trigger guard_store_business_write before insert or update or delete on public.%I for each row execute function public.guard_store_business_write()', v_table);
  end loop;
end;
$$;

create or replace function public.guard_store_creation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if session_user = 'postgres' and current_setting('role', true) in ('none', 'postgres')
    and auth.uid() is null then return new; end if;
  if auth.uid() is null or new.created_by is distinct from auth.uid()
    or not exists (select 1 from public.profiles
      where id = auth.uid() and account_status = 'active') then
    raise exception 'Tài khoản không được tạo cửa hàng.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger guard_store_creation before insert on public.stores
  for each row execute function public.guard_store_creation();

-- Platform admins are not shop members. Data API clients cannot write or read
-- these tables; privileged Edge Functions will use server-side credentials.
create table public.platform_admins (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  admin_role text not null default 'platform_admin'
    check (admin_role = 'platform_admin'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_admins_set_updated_at before update on public.platform_admins
  for each row execute function public.set_updated_at();
create table public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (char_length(action) between 3 and 80),
  target_type text not null check (char_length(target_type) between 2 and 40),
  target_id uuid,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 500),
  before_data jsonb not null default '{}'::jsonb check (jsonb_typeof(before_data) = 'object'),
  after_data jsonb not null default '{}'::jsonb check (jsonb_typeof(after_data) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id uuid unique,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc, id);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id, created_at desc);
create table public.security_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null check (char_length(event_type) between 3 and 80),
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index security_events_created_idx on public.security_events (created_at desc, id);
create index security_events_user_idx on public.security_events (user_id, created_at desc);
alter table public.platform_admins enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.security_events enable row level security;
revoke all on public.platform_admins, public.admin_audit_logs, public.security_events
  from public, anon, authenticated;
