begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
 ('fd000000-0000-4000-8000-000000000001','settings-owner@example.invalid','{}'),
 ('fd000000-0000-4000-8000-000000000002','settings-staff@example.invalid','{}'),
 ('fd000000-0000-4000-8000-000000000003','settings-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select set_config('test.settings_store',public.create_store('Staff permissions')::text,true);
select set_config('test.settings_product',public.save_product(current_setting('test.settings_store')::uuid,
 'Nước','Nước','other','lon',
 '[{"key":"base","name":"lon","factor":1,"purchase_price":6000,"sale_price":10000,"can_sell":true,"can_purchase":true}]',0)::text,true);
select public.receive_stock(current_setting('test.settings_store')::uuid,'fd000000-0000-4000-8000-000000000101',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.settings_product'),'unit_key','base','quantity',10,'unit_cost',6000)));
select set_config('test.settings_customer',(public.create_customer(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000102','Khách')->>'customer_id'),true);
select public.create_sale(current_setting('test.settings_store')::uuid,'fd000000-0000-4000-8000-000000000103',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.settings_product'),'unit_key','base','quantity',2)),
 'credit',current_setting('test.settings_customer')::uuid);
select public.save_store_staff(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000104','settings-staff@example.invalid');
select ok((public.save_store_staff(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000104','settings-staff@example.invalid')->>'duplicate')::boolean,
 'Adding staff with the same request ID is idempotent');
select is((public.list_store_staff(current_setting('test.settings_store')::uuid)->>'total')::bigint,2::bigint,
 'Owner sees both memberships');
select public.save_store_settings(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000105','BIN updated','0900','Address',1);
select ok((public.save_store_settings(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000105','BIN updated','0900','Address',1)->>'duplicate')::boolean,
 'Settings retry does not create a second revision');
select throws_ok(format($q$select public.save_store_settings(%L,'fd000000-0000-4000-8000-000000000106','Stale','','',1)$q$,
 current_setting('test.settings_store')),'P0001',null,'Stale settings cannot overwrite newer data');
select throws_ok(format($q$update public.stores set name='PATCH' where id=%L$q$,current_setting('test.settings_store')),
 '42501',null,'Direct owner PATCH cannot bypass settings audit');
select throws_ok(format($q$select public.save_store_staff(%L,'fd000000-0000-4000-8000-000000000107',null,true,true,true,false,
 'fd000000-0000-4000-8000-000000000001',1)$q$,current_setting('test.settings_store')),
 'P0001',null,'Owner cannot be removed through staff management');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select ok(public.can_store_operation(current_setting('test.settings_store')::uuid,'sell'),'New staff can sell cash');
select ok(not public.can_store_operation(current_setting('test.settings_store')::uuid,'manage_debt'),'No default debt permission');
select ok(not public.can_store_operation(current_setting('test.settings_store')::uuid,'receive_stock'),'No default import permission');
select is((select count(*) from public.store_members where store_id=current_setting('test.settings_store')::uuid),1::bigint,
 'Staff sees only own membership');
select is((select count(*) from public.customers where store_id=current_setting('test.settings_store')::uuid),0::bigint,
 'Customer RLS requires debt permission');
select is((select count(*) from public.sales where store_id=current_setting('test.settings_store')::uuid),0::bigint,
 'Credit sale RLS requires debt permission');
select is(jsonb_array_length(public.shop_activity(current_setting('test.settings_store')::uuid,0,50,'debt')->'events'),0,
 'Definer activity RPC does not bypass debt permission');
select throws_ok(format($q$select public.list_store_staff(%L)$q$,current_setting('test.settings_store')),
 '42501',null,'Staff cannot read management roster');
select throws_ok(format($q$select public.record_debt_payment(%L,%L,1000,'fd000000-0000-4000-8000-000000000108')$q$,
 current_setting('test.settings_store'),current_setting('test.settings_customer')),'42501',null,'Staff cannot collect debt before grant');
select public.create_sale(current_setting('test.settings_store')::uuid,'fd000000-0000-4000-8000-000000000109',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.settings_product'),'unit_key','base','quantity',1)));
select is((select stock_base from public.products where id=current_setting('test.settings_product')::uuid),7::bigint,
 'Allowed cash sale decreases stock exactly once');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select public.save_store_staff(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000110',null,false,true,true,true,'fd000000-0000-4000-8000-000000000002',1);
select throws_ok(format($q$select public.save_store_staff(%L,'fd000000-0000-4000-8000-000000000111',null,true,false,false,true,
 'fd000000-0000-4000-8000-000000000002',1)$q$,current_setting('test.settings_store')),
 'P0001',null,'Stale permission version is rejected');
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select public.record_debt_payment(current_setting('test.settings_store')::uuid,current_setting('test.settings_customer')::uuid,
 1000,'fd000000-0000-4000-8000-000000000112');
select is((select current_debt from public.customers where id=current_setting('test.settings_customer')::uuid),19000::bigint,
 'Debt-only staff can collect without selling permission');
select public.receive_stock(current_setting('test.settings_store')::uuid,'fd000000-0000-4000-8000-000000000113',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.settings_product'),'unit_key','base','quantity',2,'unit_cost',7000)));
select is((select stock_base from public.products where id=current_setting('test.settings_product')::uuid),9::bigint,
 'Granted import permission also permits reference purchase-price update');
select throws_ok(format($q$select public.create_sale(%L,'fd000000-0000-4000-8000-000000000109',
 '[{"product_id":"%s","unit_key":"base","quantity":1}]')$q$,current_setting('test.settings_store'),current_setting('test.settings_product')),
 '42501',null,'Revoked permission denies even a committed request replay');

select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select public.save_store_staff(current_setting('test.settings_store')::uuid,
 'fd000000-0000-4000-8000-000000000114',null,false,true,true,false,'fd000000-0000-4000-8000-000000000002',2);
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.products where store_id=current_setting('test.settings_store')::uuid),0::bigint,
 'Existing JWT cannot read shop after membership deactivation');
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000003',true);
select throws_ok(format($q$select public.list_store_staff(%L)$q$,current_setting('test.settings_store')),
 '42501',null,'Another tenant cannot read staff roster');
select set_config('request.jwt.claim.sub','fd000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.sales where store_id=current_setting('test.settings_store')::uuid),2::bigint,
 'Staff deactivation preserves sales history');
select is((select count(*) from public.audit_logs where store_id=current_setting('test.settings_store')::uuid
 and action='staff.permissions_saved'),3::bigint,'Every staff change has an atomic audit');
select * from finish();
rollback;
