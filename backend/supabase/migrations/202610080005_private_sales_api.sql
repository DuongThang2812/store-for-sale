create role bin_sales_api noinherit nologin nobypassrls;
grant bin_sales_api to postgres;
create schema sales_api;
revoke all on schema sales_api from public,anon,authenticated;
create function sales_api.checkout(p_shop uuid,p_request uuid,p_items jsonb,p_payment text,p_customer uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'sell');
  select jsonb_agg(jsonb_build_object('product_id',x->>'productId','unit_key',x->>'unitKey',
    'quantity',x->'quantity','expected_version',x->'expectedVersion')) into v_items from jsonb_array_elements(p_items)x;
  return public.create_sale_reviewed(p_shop,p_request,v_items,p_payment,p_customer);
end $$;
create function sales_api.cancellation_preview(p_shop uuid,p_sale uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_shop');
  return public.preview_sale_cancellation(p_shop,p_sale);
end $$;
create function sales_api.cancel(p_shop uuid,p_sale uuid,p_reason text,p_request uuid,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_shop');
  return public.cancel_sale_confirmed(p_shop,p_sale,p_reason,p_request,p_token);
end $$;
create function sales_api.activity(p_shop uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  return public.shop_activity(p_shop,coalesce((p_options->>'offset')::integer,0),coalesce((p_options->>'limit')::integer,50),
    p_options->>'kind',(p_options->>'customerId')::uuid,(p_options->>'productId')::uuid);
end $$;
revoke all on all functions in schema sales_api from public,anon,authenticated;
grant usage on schema sales_api to bin_sales_api;
grant execute on all functions in schema sales_api to bin_sales_api;
