-- HTTP and SQL capabilities must reject a foreign shop with 42501 before
-- reaching legacy RPCs that may use a generic business exception.
create or replace function inventory_api.receive(p_shop uuid,p_request uuid,p_items jsonb,p_note text,p_supplier uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'receive_stock');
  select jsonb_agg(jsonb_build_object('product_id',x->>'productId','unit_key',x->>'unitKey','quantity',x->'quantity','unit_cost',x->'unitCost'))
    into v_items from jsonb_array_elements(p_items)x;
  return public.receive_stock(p_shop,p_request,v_items,p_note,p_supplier);
end $$;
create or replace function inventory_api.adjust(p_shop uuid,p_product uuid,p_quantity bigint,p_reason text,p_request uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_shop');
  return public.adjust_stock(p_shop,p_product,p_quantity,p_reason,p_request,p_note);
end $$;
create or replace function inventory_api.count_stock(p_shop uuid,p_request uuid,p_items jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_shop');
  select jsonb_agg(jsonb_build_object('product_id',x->>'productId','actual_base',x->'actualBase','expected_version',x->'expectedVersion','reason',x->>'reason'))
    into v_items from jsonb_array_elements(p_items)x;
  return public.record_inventory_count_reviewed(p_shop,p_request,v_items,p_note);
end $$;
