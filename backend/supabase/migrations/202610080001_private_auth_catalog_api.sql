-- Additive strangler boundary. Old browser grants stay until the final cutover;
-- these service roles have ONLY their domain's private function capabilities.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='bin_auth_api') then
    create role bin_auth_api noinherit nologin nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='bin_catalog_api') then
    create role bin_catalog_api noinherit nologin nobypassrls;
  end if;
end $$;
create schema auth_api;
create schema catalog_api;
revoke all on schema auth_api,catalog_api from public,anon,authenticated;

create function auth_api.require_identity()
returns uuid language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Session required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and account_status='active') then
    raise exception 'Inactive account' using errcode='42501';
  end if;
  return auth.uid();
end $$;
create function auth_api.profile()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth_api.require_identity(); v_result jsonb;
begin
  select jsonb_build_object('id',id,'name',coalesce(nullif(display_name,''),'Chủ tiệm'),'accountStatus',account_status)
    into v_result from public.profiles where id=v_actor;
  return v_result;
end $$;
create function auth_api.stores()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth_api.require_identity(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'businessType',s.business_type,
    'timezone',s.timezone,'currency',s.currency,'status',s.status,'role',m.role,
    'canSell',m.role='owner' or m.can_sell,'canReceiveStock',m.role='owner' or m.can_receive_stock,
    'canManageDebt',m.role='owner' or m.can_manage_debt,'permissionVersion',m.permission_version,
    'contactPhone',s.contact_phone,'address',s.address,'settingsVersion',s.settings_version,
    'createdBy',s.created_by,'createdAt',s.created_at,'updatedAt',s.updated_at)
    order by m.created_at,s.id),'[]'::jsonb) into v_result
    from public.stores s join public.store_members m on m.store_id=s.id where m.user_id=v_actor and m.is_active;
  return v_result;
end $$;
create function auth_api.create_shop(p_name text,p_business_type text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform auth_api.require_identity();
  return public.create_store(p_name,p_business_type);
end $$;

create function catalog_api.require_member(p_store_id uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform auth_api.require_identity();
  if not public.is_store_member(p_store_id) then raise exception 'Shop access denied' using errcode='42501'; end if;
end $$;
create function catalog_api.product_json(p_product public.products)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p_product.id,'shopId',p_product.store_id,'name',p_product.name,
    'category',p_product.category,'categoryId',p_product.category_id,'productGroup',p_product.product_group,
    'baseUnit',p_product.base_unit,'stockBase',p_product.stock_base,'lowStockThreshold',p_product.low_stock_threshold,
    'isActive',p_product.is_active,'version',p_product.version,'createdAt',p_product.created_at,'updatedAt',p_product.updated_at,
    'units',(select coalesce(jsonb_agg(jsonb_build_object('id',u->>'id','key',u->>'key','name',u->>'name',
      'factor',u->'factor','purchasePrice',u->'purchase_price','salePrice',u->'sale_price',
      'canPurchase',u->'can_purchase','canSell',u->'can_sell')),'[]'::jsonb)
      from jsonb_array_elements(public.catalog_product_units(p_product.store_id,p_product.id)) u));
$$;
create function catalog_api.products(p_store_id uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=coalesce((p_options->>'limit')::integer,30);
  v_offset integer:=coalesce((p_options->>'offset')::integer,0); v_query text:=coalesce(p_options->>'query',''); v_result jsonb;
begin
  perform catalog_api.require_member(p_store_id);
  if v_limit not between 1 and 200 or v_offset not between 0 and 1000000 or length(v_query)>120 then
    raise exception 'Invalid pagination' using errcode='22023'; end if;
  select coalesce(jsonb_agg(catalog_api.product_json(p) order by p.name,p.id),'[]'::jsonb) into v_result
    from (select * from public.products where store_id=p_store_id and position(lower(v_query) in lower(name))>0
      and (not coalesce((p_options->>'activeOnly')::boolean,false) or is_active)
      order by name,id offset v_offset limit v_limit) p;
  return v_result;
end $$;
create function catalog_api.product(p_store_id uuid,p_product_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_product public.products%rowtype;
begin
  perform catalog_api.require_member(p_store_id);
  select * into v_product from public.products where store_id=p_store_id and id=p_product_id;
  if not found then raise exception 'Product not found' using errcode='P0002'; end if;
  return catalog_api.product_json(v_product);
end $$;
create function catalog_api.save_product(p_store_id uuid,p_request_id uuid,p_product_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_units jsonb; v_id uuid;
begin
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_product_id is not null and p_input ? 'openingStock' then raise exception 'Stock belongs to Inventory' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('key',u->>'key','name',u->>'name','factor',u->'factor',
    'purchase_price',u->'purchasePrice','sale_price',u->'salePrice','can_purchase',u->'canPurchase','can_sell',u->'canSell'))
    into v_units from jsonb_array_elements(p_input->'units') u;
  v_id:=public.save_product_idempotent(p_store_id,p_request_id,jsonb_build_object(
    'p_name',p_input->>'name','p_category',p_input->>'category','p_product_group',p_input->>'productGroup',
    'p_base_unit',p_input->>'baseUnit','p_units',v_units,'p_product_id',p_product_id,
    'p_opening_stock',coalesce((p_input->>'openingStock')::bigint,0),
    'p_low_stock_threshold',coalesce((p_input->>'lowStockThreshold')::bigint,5),
    'p_is_active',coalesce((p_input->>'isActive')::boolean,true),'expected_version',p_input->'expectedVersion'));
  return catalog_api.product(p_store_id,v_id);
end $$;
create function catalog_api.categories(p_store_id uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform catalog_api.require_member(p_store_id);
  if coalesce((p_options->>'limit')::integer,30) not between 1 and 200 or coalesce((p_options->>'offset')::integer,0) not between 0 and 1000000 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'isActive',is_active) order by name,id),'[]'::jsonb) into v_result
    from (select * from public.categories where store_id=p_store_id
      and position(lower(coalesce(p_options->>'query','')) in lower(name))>0
      order by name,id offset coalesce((p_options->>'offset')::integer,0) limit coalesce((p_options->>'limit')::integer,30)) c;
  return v_result;
end $$;
create function catalog_api.save_category(p_store_id uuid,p_name text,p_category_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.require_store_operation(p_store_id,'manage_shop');
  return public.save_category(p_store_id,p_name,p_category_id);
end $$;
create function catalog_api.suppliers(p_store_id uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform catalog_api.require_member(p_store_id);
  if coalesce((p_options->>'limit')::integer,30) not between 1 and 200 or coalesce((p_options->>'offset')::integer,0) not between 0 and 1000000 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'address',address,'note',note,'isActive',is_active) order by name,id),'[]'::jsonb) into v_result
    from (select * from public.suppliers where store_id=p_store_id
      and position(lower(coalesce(p_options->>'query','')) in lower(name))>0
      order by name,id offset coalesce((p_options->>'offset')::integer,0) limit coalesce((p_options->>'limit')::integer,30)) s;
  return v_result;
end $$;
create function catalog_api.save_supplier(p_store_id uuid,p_input jsonb,p_supplier_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform public.require_store_operation(p_store_id,'manage_shop');
  return public.save_supplier(p_store_id,p_input->>'name',p_input->>'phone',p_input->>'address',p_input->>'note',p_supplier_id);
end $$;

revoke all on all functions in schema auth_api,catalog_api from public,anon,authenticated;
grant usage on schema auth_api to bin_auth_api;
grant execute on function auth_api.profile(),auth_api.stores(),auth_api.create_shop(text,text) to bin_auth_api;
grant usage on schema catalog_api to bin_catalog_api;
grant execute on function catalog_api.products(uuid,jsonb),catalog_api.product(uuid,uuid),
  catalog_api.save_product(uuid,uuid,uuid,jsonb),catalog_api.categories(uuid,jsonb),catalog_api.save_category(uuid,text,uuid),
  catalog_api.suppliers(uuid,jsonb),catalog_api.save_supplier(uuid,jsonb,uuid) to bin_catalog_api;
