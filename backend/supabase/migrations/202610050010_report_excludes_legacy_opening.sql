-- Opening receivables are balance transfers, not new sales or cost events.
create or replace function public.management_report(p_store_id uuid, p_days integer default 7)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_timezone text;
  v_today date;
  v_start date;
  v_rows jsonb;
  v_top jsonb;
  v_revenue numeric := 0;
  v_cash numeric := 0;
  v_credit numeric := 0;
  v_repayments numeric := 0;
  v_cogs numeric := 0;
  v_unknown_cost bigint := 0;
  v_sales_count bigint := 0;
  v_outstanding numeric := 0;
  v_low_stock bigint := 0;
  v_out_of_stock bigint := 0;
  v_loss numeric := 0;
  v_unknown_loss bigint := 0;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được xem báo cáo quản trị.';
  end if;
  if p_days not in (1, 7, 30, 90) then
    raise exception 'Khoảng thời gian phải là 1, 7, 30 hoặc 90 ngày.';
  end if;
  select timezone into v_timezone from public.stores where id = p_store_id;
  if not found then raise exception 'Không tìm thấy cửa hàng.'; end if;
  v_today := (now() at time zone v_timezone)::date;
  v_start := v_today - (p_days - 1);

  with sale_costs as (
    select i.sale_id, coalesce(sum(i.cost_total), 0)::numeric as cost_total,
      count(*) as item_count, count(i.cost_total) as valued_count
    from public.sale_items i join public.sales s on s.id = i.sale_id
    where s.store_id = p_store_id and not s.is_legacy_opening
      and ((s.created_at at time zone v_timezone)::date between v_start and v_today
        or (s.cancelled_at at time zone v_timezone)::date between v_start and v_today)
    group by i.sale_id
  ), events as (
    select (s.created_at at time zone v_timezone)::date as day,
      s.total_amount::numeric as revenue,
      (case when s.payment_type = 'cash' then s.total_amount else 0 end)::numeric as cash_collected,
      (case when s.payment_type = 'credit' then s.total_amount else 0 end)::numeric as new_credit,
      0::numeric as repayments,
      coalesce(c.cost_total, 0) as cogs,
      (case when coalesce(c.item_count, 0) = 0 or c.item_count <> c.valued_count then 1 else 0 end)::bigint as unknown_cost,
      (case when s.status = 'completed' then 1 else 0 end)::bigint as sales_count
    from public.sales s left join sale_costs c on c.sale_id = s.id
    where s.store_id = p_store_id and not s.is_legacy_opening
      and (s.created_at at time zone v_timezone)::date between v_start and v_today
    union all
    select (s.cancelled_at at time zone v_timezone)::date,
      -s.total_amount::numeric, -coalesce(s.refund_amount, 0)::numeric,
      (case when s.payment_type = 'credit' then -s.total_amount else 0 end)::numeric,
      0::numeric, -coalesce(c.cost_total, 0),
      (case when coalesce(c.item_count, 0) = 0 or c.item_count <> c.valued_count then 1 else 0 end)::bigint,
      0::bigint
    from public.sales s left join sale_costs c on c.sale_id = s.id
    where s.store_id = p_store_id and not s.is_legacy_opening and s.status = 'cancelled'
      and (s.cancelled_at at time zone v_timezone)::date between v_start and v_today
    union all
    select (p.created_at at time zone v_timezone)::date,
      0::numeric, p.amount::numeric, 0::numeric, p.amount::numeric,
      0::numeric, 0::bigint, 0::bigint
    from public.debt_payments p
    where p.store_id = p_store_id
      and (p.created_at at time zone v_timezone)::date between v_start and v_today
  ), days as (
    select generate_series(v_start, v_today, interval '1 day')::date as day
  ), daily as (
    select d.day,
      coalesce(sum(e.revenue), 0) as revenue,
      coalesce(sum(e.cash_collected), 0) as cash_collected,
      coalesce(sum(e.new_credit), 0) as new_credit,
      coalesce(sum(e.repayments), 0) as repayments,
      coalesce(sum(e.cogs), 0) as cogs,
      coalesce(sum(e.unknown_cost), 0) as unknown_cost,
      coalesce(sum(e.sales_count), 0) as sales_count
    from days d left join events e on e.day = d.day
    group by d.day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'date', day, 'revenue', revenue, 'cash_collected', cash_collected,
      'new_credit', new_credit, 'repayments', repayments,
      'cogs', case when unknown_cost = 0 then cogs else null end,
      'gross_profit', case when unknown_cost = 0 then revenue - cogs else null end,
      'sales_count', sales_count, 'cost_data_complete', unknown_cost = 0
    ) order by day), '[]'::jsonb),
    coalesce(sum(revenue), 0), coalesce(sum(cash_collected), 0),
    coalesce(sum(new_credit), 0), coalesce(sum(repayments), 0),
    coalesce(sum(cogs), 0), coalesce(sum(unknown_cost), 0),
    coalesce(sum(sales_count), 0)
  into v_rows, v_revenue, v_cash, v_credit, v_repayments,
    v_cogs, v_unknown_cost, v_sales_count
  from daily;

  select coalesce(sum(current_debt), 0) into v_outstanding
    from public.customers where store_id = p_store_id;
  select count(*) filter (where stock_base > 0 and stock_base <= low_stock_threshold),
    count(*) filter (where stock_base = 0)
    into v_low_stock, v_out_of_stock
    from public.products where store_id = p_store_id and is_active;
  select coalesce(sum(v.loss_value), 0),
    count(*) filter (where v.loss_value is null)
    into v_loss, v_unknown_loss
    from public.stock_movements m
    left join public.inventory_adjustment_valuations v on v.movement_id = m.id
    where m.store_id = p_store_id and m.quantity_base < 0
      and m.movement_type in ('adjustment', 'inventory_count')
      and (m.created_at at time zone v_timezone)::date between v_start and v_today;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', t.product_id, 'name', t.name,
    'revenue', t.revenue, 'quantity_base', t.quantity_base, 'base_unit', t.base_unit
  ) order by t.revenue desc, t.name), '[]'::jsonb) into v_top
  from (
    select i.product_id, max(i.product_name) as name,
      sum(i.line_total)::bigint as revenue,
      sum(i.base_quantity)::bigint as quantity_base,
      max(p.base_unit) as base_unit
    from public.sale_items i
    join public.sales s on s.id = i.sale_id and s.store_id = i.store_id
    join public.products p on p.id = i.product_id and p.store_id = i.store_id
    where s.store_id = p_store_id and not s.is_legacy_opening and s.status = 'completed'
      and (s.created_at at time zone v_timezone)::date between v_start and v_today
    group by i.product_id order by revenue desc, name limit 5
  ) t;

  return jsonb_build_object(
    'timezone', v_timezone, 'start_date', v_start, 'end_date', v_today,
    'days', p_days, 'rows', v_rows, 'top_products_by_revenue', v_top,
    'totals', jsonb_build_object(
      'revenue', v_revenue, 'cash_collected', v_cash,
      'new_credit', v_credit, 'repayments', v_repayments,
      'cogs', case when v_unknown_cost = 0 then v_cogs else null end,
      'gross_profit', case when v_unknown_cost = 0 then v_revenue - v_cogs else null end,
      'gross_margin_percent', case when v_unknown_cost = 0 and v_revenue <> 0
        then round(100 * (v_revenue - v_cogs) / v_revenue, 2) else null end,
      'cost_data_complete', v_unknown_cost = 0,
      'unvalued_sale_events', v_unknown_cost,
      'sales_count', v_sales_count, 'outstanding_debt', v_outstanding,
      'low_stock_count', v_low_stock, 'out_of_stock_count', v_out_of_stock,
      'loss_value', case when v_unknown_loss = 0 then v_loss else null end,
      'loss_data_complete', v_unknown_loss = 0,
      'unvalued_loss_movements', v_unknown_loss
    )
  );
end;
$$;

