-- Cost is unknown for existing stock until the owner explicitly values it.
-- This migration is additive; old sales keep NULL COGS rather than a guessed value.
alter table public.products add column average_cost_per_base numeric(20,8)
  check (average_cost_per_base is null or average_cost_per_base >= 0);
alter table public.sale_items add column cost_per_base_at_sale numeric(20,8)
  check (cost_per_base_at_sale is null or cost_per_base_at_sale >= 0);
alter table public.sale_items add column cost_total bigint
  check (cost_total is null or cost_total >= 0);
alter table public.sale_items add constraint sale_items_cost_snapshot_pair
  check ((cost_per_base_at_sale is null) = (cost_total is null));

-- Staff can still read sale lines and stock, but not new COGS snapshots.
revoke select on public.products, public.sale_items from authenticated;
grant select (id, store_id, name, category, product_group, base_unit, stock_base,
  low_stock_threshold, is_active, version, created_at, updated_at, category_id)
  on public.products to authenticated;
grant select (id, store_id, sale_id, product_id, product_name, unit_key,
  unit_name, quantity, factor_to_base, base_quantity, unit_price, line_total, created_at)
  on public.sale_items to authenticated;

create or replace function public.capture_sale_item_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cost numeric(20,8);
begin
  select average_cost_per_base into v_cost from public.products
    where store_id = new.store_id and id = new.product_id;
  new.cost_per_base_at_sale := v_cost;
  new.cost_total := case when v_cost is null then null
    else round(v_cost * new.base_quantity)::bigint end;
  return new;
end;
$$;
create trigger sale_items_capture_cost before insert on public.sale_items
  for each row execute function public.capture_sale_item_cost();

-- receive_stock inserts an item before increasing product.stock_base.
-- Each receipt line contributes its exact VND cost to the weighted average.
create or replace function public.apply_receipt_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stock bigint;
  v_old_cost numeric(20,8);
  v_new_cost numeric(20,8);
begin
  select stock_base, average_cost_per_base into v_stock, v_old_cost
    from public.products where store_id = new.store_id and id = new.product_id for update;
  if not found then raise exception 'Không tìm thấy mặt hàng để tính giá vốn.'; end if;
  if v_stock = 0 then
    v_new_cost := new.line_total::numeric / new.base_quantity;
  elsif v_old_cost is null then
    -- Never invent a value for pre-existing stock of unknown cost.
    v_new_cost := null;
  else
    v_new_cost := (v_stock::numeric * v_old_cost + new.line_total)
      / (v_stock + new.base_quantity);
  end if;
  update public.products set average_cost_per_base = v_new_cost
    where store_id = new.store_id and id = new.product_id;
  return null;
end;
$$;
create trigger receipt_items_update_average_cost after insert on public.stock_receipt_items
  for each row execute function public.apply_receipt_cost();

-- cancel_sale restores quantities before marking the sale cancelled.
-- Return each product at the original sale cost, including multi-unit sales.
create or replace function public.restore_cancelled_sale_cost()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_line record;
  v_stock bigint;
  v_old_cost numeric(20,8);
  v_new_cost numeric(20,8);
  v_before bigint;
begin
  if old.status <> 'completed' or new.status <> 'cancelled' then return null; end if;
  for v_line in
    select product_id, sum(base_quantity)::bigint as returned_base,
      sum(cost_total)::numeric as returned_cost,
      count(*) = count(cost_total) as fully_valued
    from public.sale_items where store_id = new.store_id and sale_id = new.id
    group by product_id order by product_id
  loop
    select stock_base, average_cost_per_base into v_stock, v_old_cost
      from public.products where store_id = new.store_id and id = v_line.product_id for update;
    if not found or v_stock < v_line.returned_base then
      raise exception 'Tồn kho sau hủy không khớp chi tiết đơn.';
    end if;
    v_before := v_stock - v_line.returned_base;
    v_new_cost := case
      when not v_line.fully_valued then null
      when v_before = 0 then v_line.returned_cost / v_stock
      when v_old_cost is null then null
      else (v_before::numeric * v_old_cost + v_line.returned_cost) / v_stock
    end;
    update public.products set average_cost_per_base = v_new_cost
      where store_id = new.store_id and id = v_line.product_id;
  end loop;
  return null;
end;
$$;
create trigger sales_restore_cost_after_cancel after update of status on public.sales
  for each row execute function public.restore_cancelled_sale_cost();

-- Physical counts are committed in one RPC. The linked movement is the stock ledger.
create table public.inventory_counts (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  client_request_id uuid not null,
  request_hash text not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references auth.users(id),
  completed_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id)
);
create table public.inventory_count_items (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null,
  count_id uuid not null,
  product_id uuid not null,
  system_quantity_base bigint not null check (system_quantity_base >= 0),
  actual_quantity_base bigint not null check (actual_quantity_base >= 0),
  difference_base bigint not null,
  reason text check (reason is null or char_length(btrim(reason)) between 1 and 300),
  movement_id uuid unique,
  created_at timestamptz not null default now(),
  unique (count_id, product_id),
  foreign key (store_id, count_id) references public.inventory_counts(store_id, id) on delete restrict,
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict,
  check (difference_base = actual_quantity_base - system_quantity_base),
  check ((difference_base = 0) = (movement_id is null))
);

alter table public.stock_movements add column inventory_count_id uuid;
alter table public.stock_movements add constraint stock_movements_count_fk
  foreign key (store_id, inventory_count_id) references public.inventory_counts(store_id, id) on delete restrict;
alter table public.inventory_count_items add constraint inventory_count_items_movement_fk
  foreign key (movement_id) references public.stock_movements(id) on delete restrict;
alter table public.stock_movements drop constraint stock_movements_movement_type_check;
alter table public.stock_movements add constraint stock_movements_movement_type_check
  check (movement_type in ('opening', 'purchase', 'sale', 'sale_cancel', 'adjustment', 'inventory_count'));
alter table public.stock_movements drop constraint stock_movements_check;
alter table public.stock_movements add constraint stock_movements_reference_check check (
  (movement_type in ('sale', 'sale_cancel') and sale_id is not null and receipt_id is null and inventory_count_id is null)
  or (movement_type = 'purchase' and receipt_id is not null and sale_id is null and inventory_count_id is null)
  or (movement_type = 'inventory_count' and inventory_count_id is not null and sale_id is null and receipt_id is null)
  or (movement_type in ('opening', 'adjustment') and sale_id is null and receipt_id is null and inventory_count_id is null)
);

-- Value of shrinkage is kept in a separate owner-only table, never in member-readable movements.
create table public.inventory_adjustment_valuations (
  movement_id uuid primary key references public.stock_movements(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null,
  cost_per_base_at_adjustment numeric(20,8),
  loss_value bigint check (loss_value is null or loss_value >= 0),
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);
create or replace function public.capture_inventory_loss_value()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cost numeric(20,8);
begin
  if new.movement_type not in ('adjustment', 'inventory_count') then return null; end if;
  select average_cost_per_base into v_cost from public.products
    where store_id = new.store_id and id = new.product_id;
  insert into public.inventory_adjustment_valuations
    (movement_id, store_id, product_id, cost_per_base_at_adjustment, loss_value)
  values (new.id, new.store_id, new.product_id, v_cost,
    case when new.quantity_base < 0 and v_cost is not null
      then round(v_cost * -new.quantity_base)::bigint else null end);
  return null;
end;
$$;
create trigger stock_movements_capture_loss after insert on public.stock_movements
  for each row execute function public.capture_inventory_loss_value();

create or replace function public.record_inventory_count(
  p_store_id uuid, p_request_id uuid, p_items jsonb, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_existing public.inventory_counts%rowtype;
  v_count uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_actual bigint;
  v_difference bigint;
  v_movement uuid;
  v_reason text;
  v_changed integer := 0;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được kiểm kê kho.';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Danh sách kiểm kê phải có từ 1 đến 500 mặt hàng.';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.inventory_counts
    where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho lần kiểm kê khác.';
    end if;
    return jsonb_build_object('count_id', v_existing.id, 'duplicate', true);
  end if;
  if (select count(*) from (select distinct value ->> 'product_id'
    from jsonb_array_elements(p_items)) x) <> jsonb_array_length(p_items) then
    raise exception 'Mặt hàng kiểm kê bị lặp.';
  end if;
  perform p.id from public.products p where p.store_id = p_store_id
    and exists (select 1 from jsonb_array_elements(p_items) x
      where x.value ->> 'product_id' = p.id::text)
    order by p.id for update;

  insert into public.inventory_counts (store_id, client_request_id, request_hash, note, created_by)
  values (p_store_id, p_request_id, v_hash, nullif(btrim(p_note), ''), v_user)
  returning id into v_count;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_actual := (v_item ->> 'actual_base')::bigint;
      v_reason := nullif(btrim(v_item ->> 'reason'), '');
    exception when others then raise exception 'Số lượng kiểm kê chưa hợp lệ.'; end;
    if v_actual is null or v_actual < 0 or v_actual > 999999999999
      or char_length(coalesce(v_reason, '')) > 300 then
      raise exception 'Số lượng hoặc lý do kiểm kê chưa hợp lệ.';
    end if;
    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid for update;
    if not found then raise exception 'Không tìm thấy mặt hàng kiểm kê.'; end if;
    v_difference := v_actual - v_product.stock_base;
    if v_difference <> 0 and v_reason is null then
      raise exception 'Cần ghi lý do khi tồn thực tế khác hệ thống.';
    end if;
    v_movement := null;
    if v_difference <> 0 then
      update public.products set stock_base = v_actual, version = version + 1
        where store_id = p_store_id and id = v_product.id;
      insert into public.stock_movements (store_id, product_id, movement_type,
        quantity_base, balance_after, inventory_count_id, reason, created_by)
      values (p_store_id, v_product.id, 'inventory_count', v_difference,
        v_actual, v_count, v_reason, v_user) returning id into v_movement;
      v_changed := v_changed + 1;
    end if;
    insert into public.inventory_count_items (store_id, count_id, product_id,
      system_quantity_base, actual_quantity_base, difference_base, reason, movement_id)
    values (p_store_id, v_count, v_product.id, v_product.stock_base,
      v_actual, v_difference, v_reason, v_movement);
  end loop;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'inventory.counted', 'inventory_count', v_count,
    jsonb_build_object('changed_products', v_changed, 'items', jsonb_array_length(p_items)));
  return jsonb_build_object('count_id', v_count, 'changed_products', v_changed, 'duplicate', false);
end;
$$;
revoke all on function public.record_inventory_count(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.record_inventory_count(uuid, uuid, jsonb, text) to authenticated;

-- The eventual import wizard records the exact shop-bound snapshot. No auto-import.
create table public.legacy_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  persist_version integer not null,
  status text not null check (status in ('started', 'completed')),
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, snapshot_sha256),
  unique (store_id, id),
  check ((status = 'completed') = (completed_at is not null))
);

alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.inventory_adjustment_valuations enable row level security;
alter table public.legacy_import_batches enable row level security;
create policy inventory_counts_owner_read on public.inventory_counts for select to authenticated
  using ((select public.is_store_owner(store_id)));
create policy inventory_count_items_owner_read on public.inventory_count_items for select to authenticated
  using ((select public.is_store_owner(store_id)));
create policy inventory_adjustment_valuations_owner_read on public.inventory_adjustment_valuations for select to authenticated
  using ((select public.is_store_owner(store_id)));
create policy legacy_import_batches_owner_read on public.legacy_import_batches for select to authenticated
  using ((select public.is_store_owner(store_id)));
revoke all on public.inventory_counts, public.inventory_count_items,
  public.inventory_adjustment_valuations, public.legacy_import_batches from anon, authenticated;
grant select on public.inventory_counts, public.inventory_count_items,
  public.inventory_adjustment_valuations, public.legacy_import_batches to authenticated;

create index debt_payments_store_created_idx on public.debt_payments (store_id, created_at desc);
create index stock_receipts_store_created_idx on public.stock_receipts (store_id, created_at desc);
create index stock_movements_store_created_idx on public.stock_movements (store_id, created_at desc);
create index stock_movements_store_product_created_idx
  on public.stock_movements (store_id, product_id, created_at desc);
create index sale_items_product_idx on public.sale_items (store_id, product_id);
