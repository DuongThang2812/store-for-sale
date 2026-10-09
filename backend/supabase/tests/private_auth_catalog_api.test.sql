begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Test helpers only: these grants roll back with the fixture transaction.
grant usage on schema extensions to bin_auth_api,bin_catalog_api;
grant execute on all functions in schema extensions to bin_auth_api,bin_catalog_api;
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9300000-0000-4000-8000-000000000001','api-owner@example.invalid','{}'),
 ('f9300000-0000-4000-8000-000000000002','api-staff@example.invalid','{}'),
 ('f9300000-0000-4000-8000-000000000003','api-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000001',true);
select set_config('test.api_shop',public.create_store('Private API')::text,true);
select public.save_store_staff(current_setting('test.api_shop')::uuid,'f9300000-0000-4000-8000-000000000101','api-staff@example.invalid');
reset role;
select ok(not has_table_privilege('bin_catalog_api','public.products','SELECT'),'Catalog runtime cannot query private table directly');
select ok(not has_function_privilege('bin_auth_api','catalog_api.products(uuid,jsonb)','EXECUTE'),'Auth cannot invoke Catalog contract');
select ok(not has_function_privilege('bin_catalog_api','auth_api.stores()','EXECUTE'),'Catalog cannot read membership repository');
select ok(not has_schema_privilege('authenticated','catalog_api','USAGE'),'Browser JWT cannot reach private Catalog API schema');
set local role bin_auth_api;
select is(auth_api.profile()->>'id','f9300000-0000-4000-8000-000000000001','Auth service reads only its verified profile');
select is(jsonb_array_length(auth_api.stores()),1,'Auth service returns own memberships');
select throws_ok('select * from public.profiles','42501',null,'Auth runtime has no arbitrary profile table access');
reset role;
set local role bin_catalog_api;
select set_config('test.api_product',(catalog_api.save_product(current_setting('test.api_shop')::uuid,
 'f9300000-0000-4000-8000-000000000102',null,
 '{"name":"Cola API","category":"Nước","productGroup":"drinks","baseUnit":"chai","units":[{"key":"base","name":"chai","factor":1,"purchasePrice":6000,"salePrice":10000,"canPurchase":true,"canSell":true}]}')->>'id'),true);
select is(jsonb_array_length(catalog_api.products(current_setting('test.api_shop')::uuid,'{"limit":1}')),1,'Catalog runtime reads its contract');
select is(catalog_api.product(current_setting('test.api_shop')::uuid,current_setting('test.api_product')::uuid)#>>'{units,0,purchasePrice}',
 '6000','Owner quote is visible through the bounded contract');
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000002',true);
select is(catalog_api.product(current_setting('test.api_shop')::uuid,current_setting('test.api_product')::uuid)#>'{units,0,purchasePrice}',
 'null'::jsonb,'Default staff sees masked quote through private API');
select throws_ok(format($q$select catalog_api.save_product(%L,'f9300000-0000-4000-8000-000000000103',null,
 '{"name":"Forbidden","category":"Nước","productGroup":"other","baseUnit":"chai","units":[]}')$q$,current_setting('test.api_shop')),
 '42501',null,'Staff cannot create products');
select set_config('request.jwt.claim.sub','f9300000-0000-4000-8000-000000000003',true);
select throws_ok(format($q$select catalog_api.products(%L,'{}')$q$,current_setting('test.api_shop')),'42501',null,'Wrong tenant gets forbidden, not an unfiltered list');
reset role;
select * from finish();
rollback;
