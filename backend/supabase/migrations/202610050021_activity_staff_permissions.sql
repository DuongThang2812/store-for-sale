-- Restrict server-definer history reads as well as direct table reads.
create or replace function public.shop_activity(p_store_id uuid, p_offset integer default 0,
  p_limit integer default 50, p_kind text default null, p_customer_id uuid default null,
  p_product_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_event record; v_body jsonb; v_entries jsonb := '[]'::jsonb;
  v_owner boolean; v_more boolean := false;
begin
  if auth.uid() is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100
    or (p_kind is not null and p_kind not in ('sale','debt','cancel','stock','payment','adjustment','edit','restore')) then
    raise exception 'Bộ lọc lịch sử chưa hợp lệ.';
  end if;
  if p_customer_id is not null and not public.can_store_operation(p_store_id,'manage_debt') then
    raise exception 'Bạn không có quyền xem công nợ.' using errcode='42501';
  end if;
  v_owner := public.is_store_owner(p_store_id);
  for v_event in
    with events as (
      select s.id, s.id::text event_id, case when s.payment_type = 'credit' then 'debt' else 'sale' end kind,
        s.created_at occurred_at, s.customer_id, null::uuid product_id, 'sale' source
        from public.sales s where s.store_id = p_store_id and not s.is_legacy_opening
          and (p_product_id is null or exists(select 1 from public.sale_items i where i.sale_id = s.id and i.product_id = p_product_id))
      union all
      select s.id, s.id::text || ':cancel', 'cancel', s.cancelled_at, s.customer_id, null::uuid, 'cancel'
        from public.sales s where s.store_id = p_store_id and s.status = 'cancelled' and not s.is_legacy_opening
          and (p_product_id is null or exists(select 1 from public.sale_items i where i.sale_id = s.id and i.product_id = p_product_id))
      union all
      select r.id, r.id::text, 'stock', r.created_at, null::uuid, null::uuid, 'stock'
        from public.stock_receipts r where r.store_id = p_store_id
          and (p_product_id is null or exists(select 1 from public.stock_receipt_items i where i.receipt_id = r.id and i.product_id = p_product_id))
      union all
      select d.id, d.id::text, 'payment', d.created_at, d.customer_id, null::uuid, 'payment'
        from public.debt_payments d where d.store_id = p_store_id and p_product_id is null
      union all
      select m.id, m.id::text, 'adjustment', m.created_at, null::uuid, m.product_id, 'adjustment'
        from public.stock_movements m where m.store_id = p_store_id and m.movement_type in ('adjustment','inventory_count')
          and (p_product_id is null or m.product_id = p_product_id)
      union all
      select l.id, 'legacy:' || l.id::text, l.source_entry ->> 'kind', l.occurred_at, l.customer_id, null::uuid, 'legacy'
        from public.legacy_history_entries l where l.store_id = p_store_id and p_product_id is null
    ) select * from events e
      where (public.can_store_operation(p_store_id,'manage_debt') or (e.customer_id is null and e.kind not in ('debt','payment')))
        and (p_kind is null or e.kind = p_kind) and (p_customer_id is null or e.customer_id = p_customer_id)
      order by e.occurred_at desc, e.event_id desc offset p_offset limit p_limit + 1
  loop
    if jsonb_array_length(v_entries) = p_limit then v_more := true; exit; end if;
    if v_event.source = 'sale' then
      select jsonb_build_object('title', case when s.payment_type = 'credit' then coalesce(c.name,'Khách') || ' mua thiếu' else 'Bán hàng · Đã nhận tiền' end,
        'amount', s.total_amount, 'customer_id', s.customer_id, 'cancelled_at', s.cancelled_at,
        'can_cancel', v_owner and s.status = 'completed', 'detail', 'Đơn bán hàng trên DB',
        'items', (select coalesce(jsonb_agg(jsonb_build_object('product_id', i.product_id,
          'name', i.product_name, 'quantity', i.quantity, 'unit', i.unit_name, 'price', i.unit_price,
          'line_amount', i.line_total, 'stock_quantity', i.base_quantity) order by i.id), '[]'::jsonb)
          from public.sale_items i where i.store_id = p_store_id and i.sale_id = s.id))
        into v_body from public.sales s left join public.customers c on c.id = s.customer_id where s.id = v_event.id;
    elsif v_event.source = 'cancel' then
      select jsonb_build_object('title','Hủy đơn bán hàng','detail',s.cancellation_reason,
        'amount',s.total_amount,'sale_id',s.id,'customer_id',s.customer_id,
        'refund_amount',s.refund_amount,'debt_reduction',s.debt_reduction)
        into v_body from public.sales s where s.id = v_event.id;
    elsif v_event.source = 'stock' then
      select jsonb_build_object('title','Nhập hàng vào kho','detail',coalesce(r.note,'Phiếu nhập DB'),'amount',0,
        'purchase_total',case when v_owner then r.total_cost else null end,
        'items',(select coalesce(jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',p.name,
          'quantity',i.quantity,'unit',i.unit_name,'price',case when v_owner then i.unit_cost else null end,
          'line_amount',case when v_owner then i.line_total else null end) order by i.id),'[]'::jsonb)
          from public.stock_receipt_items i join public.products p on p.id = i.product_id
          where i.store_id = p_store_id and i.receipt_id = r.id)) into v_body from public.stock_receipts r where r.id = v_event.id;
    elsif v_event.source = 'payment' then
      select jsonb_build_object('title',c.name || ' trả nợ','detail','Đã nhận tiền trả nợ',
        'amount',d.amount,'customer_id',d.customer_id) into v_body
        from public.debt_payments d join public.customers c on c.id = d.customer_id where d.id = v_event.id;
    elsif v_event.source = 'adjustment' then
      select jsonb_build_object('title',case when m.movement_type = 'inventory_count' then 'Điều chỉnh sau kiểm kê' else 'Hao hụt / điều chỉnh kho' end,
        'detail',p.name || ' · ' || m.quantity_base::text || ' ' || p.base_unit || ' · ' || coalesce(m.reason,''),
        'amount',0,'product_id',m.product_id) into v_body from public.stock_movements m
        join public.products p on p.id = m.product_id where m.id = v_event.id;
    else
      select jsonb_build_object('source_entry',l.source_entry,'customer_id',l.customer_id,
        'legacy',true,'can_cancel',false) into v_body from public.legacy_history_entries l where l.id = v_event.id;
    end if;
    v_entries := v_entries || jsonb_build_array(v_body || jsonb_build_object(
      'id',v_event.event_id,'kind',v_event.kind,'date',v_event.occurred_at));
  end loop;
  return jsonb_build_object('events',v_entries,'has_more',v_more,
    'next_offset',p_offset + jsonb_array_length(v_entries));
end;
$$;
revoke all on function public.shop_activity(uuid, integer, integer, text, uuid, uuid) from public, anon;
grant execute on function public.shop_activity(uuid, integer, integer, text, uuid, uuid) to authenticated;
