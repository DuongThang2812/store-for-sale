create role bin_inventory_api noinherit nologin nobypassrls;
grant bin_inventory_api to postgres;
create schema inventory_api;
revoke all on schema inventory_api from public,anon,authenticated;
create function inventory_api.balances(p_shop uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  -- A bounded read contract while identity and stock still share products.
  return catalog_api.products(p_shop,p_options);
end $$;
create function inventory_api.receive(p_shop uuid,p_request uuid,p_items jsonb,p_note text,p_supplier uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  select jsonb_agg(jsonb_build_object('product_id',x->>'productId','unit_key',x->>'unitKey','quantity',x->'quantity','unit_cost',x->'unitCost'))
    into v_items from jsonb_array_elements(p_items)x;
  return public.receive_stock(p_shop,p_request,v_items,p_note,p_supplier);
end $$;
create function inventory_api.adjust(p_shop uuid,p_product uuid,p_quantity bigint,p_reason text,p_request uuid,p_note text)
returns jsonb language sql security definer set search_path='' as $$
  select public.adjust_stock(p_shop,p_product,p_quantity,p_reason,p_request,p_note);
$$;
create function inventory_api.count_stock(p_shop uuid,p_request uuid,p_items jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  select jsonb_agg(jsonb_build_object('product_id',x->>'productId','actual_base',x->'actualBase','expected_version',x->'expectedVersion','reason',x->>'reason'))
    into v_items from jsonb_array_elements(p_items)x;
  return public.record_inventory_count_reviewed(p_shop,p_request,v_items,p_note);
end $$;
create function inventory_api.product_cost(p_shop uuid,p_product uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select public.inventory_product_cost(p_shop,p_product);
$$;
create function inventory_api.value_opening(p_shop uuid,p_product uuid,p_unit text,p_cost bigint,p_request uuid)
returns jsonb language sql security definer set search_path='' as $$
  select public.value_opening_stock(p_shop,p_product,p_unit,p_cost,p_request);
$$;
revoke all on all functions in schema inventory_api from public,anon,authenticated;
grant usage on schema inventory_api to bin_inventory_api;
grant execute on all functions in schema inventory_api to bin_inventory_api;
