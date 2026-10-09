begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
  ('fa100000-0000-4000-8000-000000000001','snack-owner@example.invalid','{}'),
  ('fa100000-0000-4000-8000-000000000002','snack-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000001',true);
select set_config('test.snack_store',public.create_store('Snack multi units','grocery')::text,true);
select set_config('test.snack_units','[
  {"key":"base","name":"viên","factor":1,"purchase_price":150,"sale_price":1000,"can_purchase":true,"can_sell":true},
  {"key":"bag","name":"bịch","factor":200,"purchase_price":30000,"sale_price":40000,"can_purchase":true,"can_sell":true},
  {"key":"pack","name":"thùng","factor":4000,"purchase_price":600000,"sale_price":700000,"can_purchase":true,"can_sell":true},
  {"key":"packet","name":"gói","factor":20,"purchase_price":3000,"sale_price":5000,"can_purchase":true,"can_sell":true}]',true);
select set_config('test.snack_product',public.save_product(current_setting('test.snack_store')::uuid,
  'Kẹo bốn cấp','Bánh kẹo','snacks','viên',current_setting('test.snack_units')::jsonb,0,5)::text,true);
select results_eq($$ select unit_key,factor_to_base,sale_price from public.product_units
  where product_id=current_setting('test.snack_product')::uuid order by unit_key $$,
  $$ values ('bag'::text,200::bigint,40000::bigint),('base'::text,1::bigint,1000::bigint),
    ('pack'::text,4000::bigint,700000::bigint),('packet'::text,20::bigint,5000::bigint) $$,
  'Four snack units keep independent conversion and price');
select lives_ok($$ select public.receive_stock(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000101',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','pack','quantity',2,'unit_cost',600000))) $$,
  'Snack carton receipt commits');
select is((select stock_base from public.products where id=current_setting('test.snack_product')::uuid),8000::bigint,
  'Two cartons add 8000 pieces to a single stock');
select set_config('test.snack_customer',public.save_customer(current_setting('test.snack_store')::uuid,'Khách kẹo')::text,true);
select set_config('test.snack_items',jsonb_build_array(
  jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','pack','quantity',1),
  jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','bag','quantity',2),
  jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','packet','quantity',3),
  jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','base','quantity',5))::text,true);
select set_config('test.snack_sale',public.create_sale(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000102',
  current_setting('test.snack_items')::jsonb,'credit',current_setting('test.snack_customer')::uuid)::text,true);
select is((current_setting('test.snack_sale')::jsonb->>'total_amount')::bigint,800000::bigint,
  'Mixed snack revenue uses each selected unit price, not 4465 times piece price');
select is((select stock_base from public.products where id=current_setting('test.snack_product')::uuid),3535::bigint,
  'Mixed carton/bag/packet/piece sale removes 4465 pieces');
select is((select current_debt from public.customers where id=current_setting('test.snack_customer')::uuid),800000::bigint,
  'Mixed-unit credit debt is atomic with the sale');
select ok((public.create_sale(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000102',
  current_setting('test.snack_items')::jsonb,'credit',current_setting('test.snack_customer')::uuid)->>'duplicate')::boolean,
  'Mixed-unit credit retry is idempotent');
select is((select stock_base from public.products where id=current_setting('test.snack_product')::uuid),3535::bigint,
  'Retry cannot remove stock twice');
reset role;
select is((select sum(cost_total) from public.sale_items where sale_id=(current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid),
  669750::numeric,'All four sale lines snapshot cost 150 per piece');
select results_eq($$ select unit_name,base_quantity,unit_price,line_total from public.sale_items
  where sale_id=(current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid order by unit_key $$,
  $$ values ('bịch'::text,400::bigint,40000::bigint,80000::bigint),('viên'::text,5::bigint,1000::bigint,5000::bigint),
    ('thùng'::text,4000::bigint,700000::bigint,700000::bigint),('gói'::text,60::bigint,5000::bigint,15000::bigint) $$,
  'History keeps all four entered units and discounted prices');
set local role authenticated;
select is((public.management_report(current_setting('test.snack_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  130250::bigint,'Snack profit is calculated server-side');
select lives_ok($$ select public.record_debt_payment(current_setting('test.snack_store')::uuid,
  current_setting('test.snack_customer')::uuid,50000,'fa100000-0000-4000-8000-000000000103') $$,'Partial payment commits for mixed-unit credit sale');
select is((select current_debt from public.customers where id=current_setting('test.snack_customer')::uuid),750000::bigint,
  'Partial payment reduces only outstanding debt');
select set_config('test.snack_preview',public.preview_sale_cancellation(current_setting('test.snack_store')::uuid,
  (current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid)::text,true);
select is((current_setting('test.snack_preview')::jsonb->>'refund_amount')::bigint,50000::bigint,'Cancellation refunds only the amount already paid');
select is((current_setting('test.snack_preview')::jsonb->>'debt_reduction')::bigint,750000::bigint,'Cancellation preview keeps the exact unpaid portion');
select lives_ok($$ select public.cancel_sale_confirmed(current_setting('test.snack_store')::uuid,
  (current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid,'Khách trả hàng','fa100000-0000-4000-8000-000000000104',
  current_setting('test.snack_preview')::jsonb->>'preview_token') $$,'Mixed-unit cancellation commits after partial debt payment');
select ok((public.cancel_sale_confirmed(current_setting('test.snack_store')::uuid,
  (current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid,'Khách trả hàng','fa100000-0000-4000-8000-000000000104',
  current_setting('test.snack_preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'Cancellation retry cannot restore stock twice');
select is((select stock_base from public.products where id=current_setting('test.snack_product')::uuid),8000::bigint,
  'Cancellation restores exactly 4465 pieces');
select is((select current_debt from public.customers where id=current_setting('test.snack_customer')::uuid),0::bigint,
  'Cancellation clears only the 750000 outstanding portion');
select is((public.management_report(current_setting('test.snack_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  0::bigint,'Cancelled snack sale contributes no profit');
select is((public.receive_stock(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000105',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.snack_product'),'unit_key','packet','quantity',5,'unit_cost',2500)))->>'total_cost')::bigint,
  12500::bigint,'Packet receipt uses price per packet');
select is((select stock_base from public.products where id=current_setting('test.snack_product')::uuid),8100::bigint,
  'Five packets add 100 pieces');
select is((select (u->>'purchase_price')::bigint from jsonb_array_elements(public.catalog_product_units(current_setting('test.snack_store')::uuid,current_setting('test.snack_product')::uuid)) u where u->>'key'='pack'),
  600000::bigint,'Packet receipt does not overwrite carton quote');
reset role;
select is((select average_cost_per_base from public.products where id=current_setting('test.snack_product')::uuid),
  149.69135802::numeric,'Weighted average combines carton and packet receipts');
select is((select sum(cost_total) from public.sale_items where sale_id=(current_setting('test.snack_sale')::jsonb->>'sale_id')::uuid),
  669750::numeric,'New receipt cost never changes historical COGS');
set local role authenticated;
select throws_ok(format($$ select public.save_product(%L::uuid,'Kẹo đổi quy cách','Bánh kẹo','snacks','viên',%L::jsonb,0,5,true,%L::uuid) $$,
  current_setting('test.snack_store'),replace(current_setting('test.snack_units'),'"factor":20,','"factor":30,'),current_setting('test.snack_product')),
  'P0001','Mặt hàng còn tồn kho nên chưa thể đổi quy cách.','Server rejects changed packet conversion while stock exists');
select is((select factor_to_base from public.product_units where product_id=current_setting('test.snack_product')::uuid and unit_key='packet'),20::bigint,
  'Failed conversion edit leaves old packet factor');
select set_config('test.snack_csv',jsonb_build_array(jsonb_build_object('product',jsonb_build_object(
  'name','Kẹo CSV bốn cấp','category','Bánh kẹo','product_group','snacks','base_unit','viên','low_stock_threshold',5,
  'units',current_setting('test.snack_units')::jsonb),'unit_key','packet','quantity',5,'unit_cost',2500))::text,true);
select lives_ok($$ select public.import_stock_csv(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000106',
  current_setting('test.snack_csv')::jsonb) $$,'CSV creates four units and valued packet receipt in one transaction');
select ok((public.import_stock_csv(current_setting('test.snack_store')::uuid,'fa100000-0000-4000-8000-000000000106',
  current_setting('test.snack_csv')::jsonb)->>'duplicate')::boolean,'Multi-unit CSV retry is idempotent');
select is((select stock_base from public.products where store_id=current_setting('test.snack_store')::uuid and name='Kẹo CSV bốn cấp'),100::bigint,
  'CSV retry does not duplicate packet stock');
select set_config('request.jwt.claim.sub','fa100000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.products where store_id=current_setting('test.snack_store')::uuid),0::bigint,
  'Another tenant cannot read multi-unit snacks');
select throws_ok(format($$ select public.receive_stock(%L::uuid,'fa100000-0000-4000-8000-000000000107',
  '[{"product_id":"%s","unit_key":"packet","quantity":5,"unit_cost":2500}]') $$,current_setting('test.snack_store'),current_setting('test.snack_product')),
  'P0001','Bạn không có quyền với cửa hàng này.','Another tenant cannot receive packets');
select * from finish();
rollback;
