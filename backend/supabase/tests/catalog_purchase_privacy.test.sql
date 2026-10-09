begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9200000-0000-4000-8000-000000000001','privacy-owner@example.invalid','{}'),
 ('f9200000-0000-4000-8000-000000000002','privacy-staff@example.invalid','{}'),
 ('f9200000-0000-4000-8000-000000000003','privacy-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
select set_config('test.privacy_store',public.create_store('Catalog privacy')::text,true);
select set_config('test.privacy_product',public.save_product(current_setting('test.privacy_store')::uuid,
 'Nước','Nước','other','lon',
 '[{"key":"base","name":"lon","factor":1,"purchase_price":6000,"sale_price":10000,"can_purchase":true,"can_sell":true}]',0)::text,true);
select public.receive_stock(current_setting('test.privacy_store')::uuid,'f9200000-0000-4000-8000-000000000101',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.privacy_product'),'unit_key','base','quantity',10,'unit_cost',6000)));
select public.save_store_staff(current_setting('test.privacy_store')::uuid,
 'f9200000-0000-4000-8000-000000000102','privacy-staff@example.invalid');
select is((select units#>>'{0,purchase_price}' from public.product_catalog where id=current_setting('test.privacy_product')::uuid),
 '6000','Owner reads purchase quote through the scoped catalog');
select is((select count(*) from public.stock_receipts where store_id=current_setting('test.privacy_store')::uuid),1::bigint,'Owner reads receipt history');
select throws_ok('select purchase_price from public.product_units','42501',null,'Raw unit purchase-price column is inaccessible even to owners');

select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
select is((select units#>'{0,purchase_price}' from public.product_catalog where id=current_setting('test.privacy_product')::uuid),
 'null'::jsonb,'Default retail staff sees no purchase quote');
select is((select units#>>'{0,sale_price}' from public.product_catalog where id=current_setting('test.privacy_product')::uuid),
 '10000','Retail staff still sees selling prices');
select is((select units#>>'{0,factor}' from public.product_catalog where id=current_setting('test.privacy_product')::uuid),
 '1','Retail staff retains unit conversion');
select is(public.catalog_product_units(current_setting('test.privacy_store')::uuid,current_setting('test.privacy_product')::uuid)#>'{0,purchase_price}',
 'null'::jsonb,'Calling the helper directly cannot bypass masking');
select throws_ok('select purchase_price from public.product_units','42501',null,'Raw Data API cannot leak unit costs');
select throws_ok('select purchase_price from public.product_batches','42501',null,'Raw batch cost is private');
select is((select count(*) from public.stock_receipts where store_id=current_setting('test.privacy_store')::uuid),0::bigint,'Default staff cannot read receipt totals');
select is((select count(*) from public.stock_receipt_items where store_id=current_setting('test.privacy_store')::uuid),0::bigint,'Default staff cannot read receipt line costs');

select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
select public.save_store_staff(current_setting('test.privacy_store')::uuid,'f9200000-0000-4000-8000-000000000103',
 null,true,true,false,true,'f9200000-0000-4000-8000-000000000002',1);
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000002',true);
select is(public.catalog_product_units(current_setting('test.privacy_store')::uuid,current_setting('test.privacy_product')::uuid)#>>'{0,purchase_price}',
 '6000','Explicit import permission admits current purchase quotations');
select is((select count(*) from public.stock_receipts where store_id=current_setting('test.privacy_store')::uuid),0::bigint,'Import permission does not grant financial history');
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000003',true);
select is(public.catalog_product_units(current_setting('test.privacy_store')::uuid,current_setting('test.privacy_product')::uuid),'[]'::jsonb,'Other tenant cannot call helper to read units');
select is((select count(*) from public.product_catalog where store_id=current_setting('test.privacy_store')::uuid),0::bigint,'Other tenant cannot read catalog rows');
select set_config('request.jwt.claim.sub','',true);
select is(public.catalog_product_units(current_setting('test.privacy_store')::uuid,current_setting('test.privacy_product')::uuid),'[]'::jsonb,'No JWT identity means no unit data');
select ok(not has_function_privilege('anon','public.catalog_product_units(uuid,uuid)','EXECUTE'),'Anonymous role cannot execute private helper');
select * from finish();
rollback;
