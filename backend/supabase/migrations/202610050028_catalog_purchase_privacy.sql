-- Retail staff need units/prices/stock, but not supplier quotations or receipt costs.
-- Raw purchase prices are never exposed through table SELECT, including for owners.
revoke select on public.product_units from authenticated;
grant select (id, store_id, product_id, unit_key, unit_name, factor_to_base,
  sale_price, can_purchase, can_sell, created_at, updated_at)
  on public.product_units to authenticated;

create function public.catalog_product_units(p_store_id uuid, p_product_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'key', u.unit_key, 'name', u.unit_name, 'factor', u.factor_to_base,
    'purchase_price', case when public.can_store_operation(p_store_id, 'receive_stock')
      then u.purchase_price else null end,
    'sale_price', u.sale_price, 'can_purchase', u.can_purchase, 'can_sell', u.can_sell
  ) order by u.factor_to_base, u.unit_key), '[]'::jsonb)
  from public.product_units u
  where u.store_id = p_store_id and u.product_id = p_product_id
    and public.is_store_member(p_store_id);
$$;
revoke all on function public.catalog_product_units(uuid, uuid) from public, anon;
grant execute on function public.catalog_product_units(uuid, uuid) to authenticated;

-- Preserve the UI contract and invoker RLS on products. The bounded helper above
-- explicitly checks the caller's membership before reading the protected column.
create or replace view public.product_catalog with (security_invoker = true) as
select p.id, p.store_id, p.name, p.category, p.product_group, p.base_unit, p.stock_base,
  p.low_stock_threshold, p.is_active, p.version, p.created_at, p.updated_at,
  public.catalog_product_units(p.store_id, p.id) as units, p.category_id
from public.products p;

drop policy product_quotes_select_member on public.product_source_quotes;
create policy product_quotes_select_permission on public.product_source_quotes
  for select to authenticated using (public.can_store_operation(store_id, 'receive_stock'));

-- Cost history remains owner-only even when a staff member may enter a receipt.
-- shop_activity provides quantity/history to staff with financial fields masked.
drop policy receipts_select_member on public.stock_receipts;
create policy receipts_select_owner on public.stock_receipts
  for select to authenticated using (public.is_store_owner(store_id));
drop policy receipt_items_select_member on public.stock_receipt_items;
create policy receipt_items_select_owner on public.stock_receipt_items
  for select to authenticated using (public.is_store_owner(store_id));

-- Keep non-financial batch metadata available under the existing tenant RLS.
revoke select on public.product_batches from authenticated;
grant select (id, store_id, product_id, receipt_id, supplier_id, received_at,
  quantity_received, quantity_remaining, purchase_unit, expiry_date, created_at)
  on public.product_batches to authenticated;
