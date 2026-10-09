-- Read-only owner dashboard. All sections share the caller's statement snapshot.
alter function public.management_report(uuid, integer) stable;

create or replace function public.shop_dashboard(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_report jsonb;
  v_timezone text;
  v_today date;
  v_start timestamptz;
  v_end timestamptz;
  v_high_stock jsonb;
  v_low_stock jsonb;
  v_receipts jsonb;
  v_spoilage_units jsonb;
  v_spoilage_value numeric;
  v_unknown bigint;
  v_movements bigint;
  v_debt_customers bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được xem báo cáo quản trị.' using errcode = '42501';
  end if;
  v_report := public.management_report(p_store_id, 1);
  v_timezone := v_report ->> 'timezone';
  v_today := (v_report ->> 'end_date')::date;
  v_start := v_today::timestamp at time zone v_timezone;
  v_end := (v_today + 1)::timestamp at time zone v_timezone;

  -- Each base unit has its own ranking; grams are never ranked against pieces.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
    'stock_base', p.stock_base, 'base_unit', p.base_unit) order by p.base_unit, p.unit_rank), '[]'::jsonb)
    into v_high_stock
  from (
    select ranked.* from (
      select id, name, stock_base, base_unit,
        row_number() over (partition by base_unit order by stock_base desc, id) as unit_rank
      from public.products where store_id = p_store_id and is_active and stock_base > 0
    ) ranked order by unit_rank, base_unit, id limit 10
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name,
    'stock_base', p.stock_base, 'base_unit', p.base_unit) order by p.stock_base, p.id), '[]'::jsonb)
    into v_low_stock
  from (select id, name, stock_base, base_unit from public.products
    where store_id = p_store_id and is_active and stock_base <= low_stock_threshold
    order by stock_base, id limit 5) p;

  select coalesce(jsonb_agg(jsonb_build_object('receipt_id', r.id, 'created_at', r.created_at,
    'total_cost', r.total_cost, 'supplier_name', s.name,
    'item_count', (select count(*) from public.stock_receipt_items i
      where i.store_id = p_store_id and i.receipt_id = r.id))
    order by r.created_at desc, r.id), '[]'::jsonb) into v_receipts
  from (select id, store_id, created_at, total_cost, supplier_id from public.stock_receipts
    where store_id = p_store_id order by created_at desc, id limit 10) r
  left join public.suppliers s on s.store_id = r.store_id and s.id = r.supplier_id;

  -- Only the structured reason "spoiled" is spoilage. Free-text notes and
  -- other losses/count corrections must not inflate this figure.
  select coalesce(sum(v.loss_value), 0), count(*) filter (where v.loss_value is null), count(*)
    into v_spoilage_value, v_unknown, v_movements
  from public.stock_movements m
  left join public.inventory_adjustment_valuations v
    on v.movement_id = m.id and v.store_id = m.store_id
  where m.store_id = p_store_id and m.movement_type = 'adjustment'
    and m.adjustment_reason = 'spoiled' and m.quantity_base < 0
    and m.created_at >= v_start and m.created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object('base_unit', t.base_unit,
    'quantity_base', t.quantity_base) order by t.base_unit), '[]'::jsonb) into v_spoilage_units
  from (select p.base_unit, sum(-m.quantity_base::numeric) as quantity_base
    from public.stock_movements m join public.products p
      on p.store_id = m.store_id and p.id = m.product_id
    where m.store_id = p_store_id and m.movement_type = 'adjustment'
      and m.adjustment_reason = 'spoiled' and m.quantity_base < 0
      and m.created_at >= v_start and m.created_at < v_end
    group by p.base_unit) t;

  select count(*) into v_debt_customers from public.customers
    where store_id = p_store_id and current_debt > 0;
  return jsonb_build_object('report', v_report,
    'debt_customer_count', v_debt_customers,
    'high_stock_products', v_high_stock, 'low_stock_products', v_low_stock,
    'recent_stock_receipts', v_receipts,
    'spoilage', jsonb_build_object('quantity_by_unit', v_spoilage_units,
      'value', case when v_unknown = 0 then v_spoilage_value else null end,
      'movement_count', v_movements, 'unvalued_movements', v_unknown,
      'cost_data_complete', v_unknown = 0));
end;
$$;
revoke all on function public.shop_dashboard(uuid) from public, anon;
grant execute on function public.shop_dashboard(uuid) to authenticated;
