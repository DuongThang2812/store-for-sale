-- Existing stock may predate cost tracking. Its value must be entered by the owner;
-- changing today's price must never rewrite historical sale cost snapshots.
create table public.opening_cost_valuations (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  product_id uuid not null,
  client_request_id uuid not null,
  unit_key text not null,
  stock_base_at_valuation bigint not null check (stock_base_at_valuation > 0),
  cost_per_unit bigint not null check (cost_per_unit between 0 and 999999999),
  cost_per_base numeric(20,8) not null check (cost_per_base >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (store_id, client_request_id),
  unique (store_id, product_id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete restrict
);
alter table public.opening_cost_valuations enable row level security;
create policy opening_cost_valuations_owner_read on public.opening_cost_valuations
  for select to authenticated using ((select public.is_store_owner(store_id)));
revoke all on public.opening_cost_valuations from anon, authenticated;
grant select on public.opening_cost_valuations to authenticated;

create or replace function public.value_opening_stock(
  p_store_id uuid, p_product_id uuid, p_unit_key text,
  p_cost_per_unit bigint, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_existing public.opening_cost_valuations%rowtype;
  v_product public.products%rowtype;
  v_factor bigint;
  v_cost numeric(20,8);
  v_valuation uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được định giá tồn đầu kỳ.';
  end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_cost_per_unit is null or p_cost_per_unit not between 0 and 999999999 then
    raise exception 'Giá vốn nhập chưa hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.opening_cost_valuations
    where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.product_id is distinct from p_product_id
      or v_existing.unit_key is distinct from p_unit_key
      or v_existing.cost_per_unit is distinct from p_cost_per_unit then
      raise exception 'Mã yêu cầu đã dùng cho định giá khác.';
    end if;
    return jsonb_build_object('valuation_id', v_existing.id,
      'cost_per_base', v_existing.cost_per_base, 'duplicate', true);
  end if;
  select * into v_product from public.products
    where store_id = p_store_id and id = p_product_id for update;
  if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
  if v_product.stock_base = 0 then
    raise exception 'Mặt hàng chưa có tồn để định giá.';
  end if;
  if v_product.average_cost_per_base is not null then
    raise exception 'Mặt hàng đã có giá vốn; không thể định giá lần hai.';
  end if;
  select factor_to_base into v_factor from public.product_units
    where store_id = p_store_id and product_id = p_product_id and unit_key = p_unit_key;
  if not found then raise exception 'Đơn vị định giá chưa hợp lệ.'; end if;
  v_cost := p_cost_per_unit::numeric / v_factor;
  update public.products set average_cost_per_base = v_cost
    where store_id = p_store_id and id = p_product_id;
  insert into public.opening_cost_valuations
    (store_id, product_id, client_request_id, unit_key, stock_base_at_valuation,
      cost_per_unit, cost_per_base, created_by)
  values (p_store_id, p_product_id, p_request_id, p_unit_key, v_product.stock_base,
    p_cost_per_unit, v_cost, v_user) returning id into v_valuation;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.opening_valued', 'product', p_product_id,
    jsonb_build_object('valuation_id', v_valuation, 'unit_key', p_unit_key,
      'stock_base', v_product.stock_base));
  return jsonb_build_object('valuation_id', v_valuation,
    'cost_per_base', v_cost, 'duplicate', false);
end;
$$;
revoke all on function public.value_opening_stock(uuid, uuid, text, bigint, uuid)
  from public, anon;
grant execute on function public.value_opening_stock(uuid, uuid, text, bigint, uuid)
  to authenticated;

-- Trigger functions run via table operations only; no client RPC execution.
revoke all on function public.capture_sale_item_cost(), public.apply_receipt_cost(),
  public.restore_cancelled_sale_cost(), public.capture_inventory_loss_value()
  from public, anon, authenticated;
