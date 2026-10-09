begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data) values
  ('fb000000-0000-4000-8000-000000000001','seed-owner@example.invalid','{}'),
  ('fb000000-0000-4000-8000-000000000002','seed-outsider@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000001',true);
select set_config('test.seed_store',public.create_store('Hạt test')::text,true);
select set_config('test.seed_units','[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false},
  {"key":"lang","name":"lạng","factor":100,"sale_price":15000,"can_purchase":false,"can_sell":true},
  {"key":"pack","name":"kg","factor":1000,"purchase_price":100000,"sale_price":140000,"can_purchase":true,"can_sell":true}]',true);
select set_config('test.seed_product',public.save_product(current_setting('test.seed_store')::uuid,
  'Hạt test','Hạt','seeds','gram',current_setting('test.seed_units')::jsonb,0,500)::text,true);
select is((select base_unit from public.products where id=current_setting('test.seed_product')::uuid),'gram','New seed stock uses grams');
select results_eq($$ select unit_name,factor_to_base,sale_price from public.product_units
    where product_id=current_setting('test.seed_product')::uuid order by unit_key $$,
  $$ values ('gram'::text,1::bigint,null::bigint),('lạng'::text,100::bigint,15000::bigint),('kg'::text,1000::bigint,140000::bigint) $$,
  'Kg/lang prices and factors are independent server data');
select throws_ok(format($$ select public.save_product(%L::uuid,'Sai quy đổi','Hạt','seeds','gram',%L::jsonb) $$,
  current_setting('test.seed_store'),replace(current_setting('test.seed_units'),'"factor":100,','"factor":10,')),
  'P0001','Quy đổi kg, lạng, gram chưa chính xác.','Server rejects incorrect lang conversion');
select is((select count(*) from public.products where name='Sai quy đổi'),0::bigint,'Invalid product save rolls back entirely');

select set_config('test.seed_receipt',public.receive_stock(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000101',jsonb_build_array(jsonb_build_object(
    'product_id',current_setting('test.seed_product'),'unit_key','pack','quantity',5,'unit_cost',100000)))::text,true);
select is((current_setting('test.seed_receipt')::jsonb->>'total_cost')::bigint,500000::bigint,'Receive 5 kg costs 500000 VND');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),5000::bigint,'Receive 5 kg records 5000 grams');
select ok((public.receive_stock(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000101',jsonb_build_array(jsonb_build_object(
    'product_id',current_setting('test.seed_product'),'unit_key','pack','quantity',5,'unit_cost',100000)))->>'duplicate')::boolean,
  'Receipt retry is idempotent');

select set_config('test.seed_sale_items',jsonb_build_array(jsonb_build_object(
  'product_id',current_setting('test.seed_product'),'unit_key','pack','quantity',1.5,
  'expected_version',(select version from public.products where id=current_setting('test.seed_product')::uuid)))::text,true);
select set_config('test.seed_sale',public.create_sale_reviewed(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000102',current_setting('test.seed_sale_items')::jsonb,'cash',null)::text,true);
select is((current_setting('test.seed_sale')::jsonb->>'total_amount')::bigint,210000::bigint,'1.5 kg uses kg price, not 15 times lang price');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),3500::bigint,'Required case: 5000 grams minus 1.5 kg leaves 3500 grams');
select ok((public.create_sale_reviewed(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000102',current_setting('test.seed_sale_items')::jsonb,'cash',null)->>'duplicate')::boolean,
  'Reviewed sale retry returns committed result despite changed stock version');
select is((select count(*) from public.sale_items where sale_id=(current_setting('test.seed_sale')::jsonb->>'sale_id')::uuid),1::bigint,'Retry does not duplicate sale line');
reset role;
select results_eq($$ select quantity,factor_to_base,base_quantity,unit_price,line_total,cost_total
  from public.sale_items where sale_id=(current_setting('test.seed_sale')::jsonb->>'sale_id')::uuid $$,
  $$ values (1.5::numeric,1000::bigint,1500::bigint,140000::bigint,210000::bigint,150000::bigint) $$,
  'Sale snapshots precise weight, price and 150000 VND cost');
set local role authenticated;
select is((public.management_report(current_setting('test.seed_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  60000::bigint,'Seed profit is computed from server cost snapshots');
select set_config('test.seed_preview',public.preview_sale_cancellation(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_sale')::jsonb->>'sale_id')::uuid)::text,true);
select is((current_setting('test.seed_preview')::jsonb->>'refund_amount')::bigint,210000::bigint,'Cancellation preview uses actual received cash');
select lives_ok($$ select public.cancel_sale_confirmed(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_sale')::jsonb->>'sale_id')::uuid,'Khách trả hàng','fb000000-0000-4000-8000-000000000103',
  current_setting('test.seed_preview')::jsonb->>'preview_token') $$,'Owner cancellation commits');
select ok((public.cancel_sale_confirmed(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_sale')::jsonb->>'sale_id')::uuid,'Khách trả hàng','fb000000-0000-4000-8000-000000000103',
  current_setting('test.seed_preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'Cancellation retry restores grams only once');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),5000::bigint,'Cancellation restores all 5000 grams');
select is((public.management_report(current_setting('test.seed_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  0::bigint,'Cancellation reverses revenue and cost in report');

select set_config('test.seed_mixed',public.create_sale(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000104',jsonb_build_array(
    jsonb_build_object('product_id',current_setting('test.seed_product'),'unit_key','pack','quantity',1),
    jsonb_build_object('product_id',current_setting('test.seed_product'),'unit_key','lang','quantity',0.01)))::text,true);
select is((current_setting('test.seed_mixed')::jsonb->>'total_amount')::bigint,140150::bigint,'Mixed kg and 0.01 lang retain each unit price');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),3999::bigint,'Mixed units remove exactly 1001 grams');
select throws_ok(format($$ select public.create_sale(%L::uuid,'fb000000-0000-4000-8000-000000000105',
  '[{"product_id":"%s","unit_key":"lang","quantity":0.001}]') $$,
  current_setting('test.seed_store'),current_setting('test.seed_product')),
  'P0001','Số lượng Hạt test chưa quy đổi thành đơn vị kho nguyên.','Sub-gram lang quantity is rejected server-side');
select is((select count(*) from public.sales where client_request_id='fb000000-0000-4000-8000-000000000105'),0::bigint,'Invalid sale creates no transaction');
select throws_ok(format($$ select public.create_sale(%L::uuid,'fb000000-0000-4000-8000-000000000106',
  '[{"product_id":"%s","unit_key":"pack","quantity":3},{"product_id":"%s","unit_key":"lang","quantity":10}]') $$,
  current_setting('test.seed_store'),current_setting('test.seed_product'),current_setting('test.seed_product')),
  'P0001','Không đủ hàng Hạt test trong kho.','Mixed unit total cannot overdraw stock');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),3999::bigint,'Failed second sale line rolls back first stock deduction');

select lives_ok($$ select public.record_inventory_count_reviewed(current_setting('test.seed_store')::uuid,
  'fb000000-0000-4000-8000-000000000107',jsonb_build_array(jsonb_build_object(
    'product_id',current_setting('test.seed_product'),'actual_base',3899,'reason','Hao hụt khi cân',
    'expected_version',(select version from public.products where id=current_setting('test.seed_product')::uuid)))) $$,
  'Reviewed count measures seeds in grams');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),3899::bigint,'Count records exact gram balance');
reset role;
select is((select loss_value from public.inventory_adjustment_valuations v join public.stock_movements m on m.id=v.movement_id
  where m.product_id=current_setting('test.seed_product')::uuid and m.movement_type='inventory_count'),10000::bigint,'100 gram loss uses 100 VND/gram cost');
set local role authenticated;
select set_config('test.seed_mixed_preview',public.preview_sale_cancellation(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_mixed')::jsonb->>'sale_id')::uuid)::text,true);
select lives_ok($$ select public.cancel_sale_confirmed(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_mixed')::jsonb->>'sale_id')::uuid,'Trả toàn bộ hàng','fb000000-0000-4000-8000-000000000109',
  current_setting('test.seed_mixed_preview')::jsonb->>'preview_token') $$,'Mixed kg/lang cancellation commits');
select ok((public.cancel_sale_confirmed(current_setting('test.seed_store')::uuid,
  (current_setting('test.seed_mixed')::jsonb->>'sale_id')::uuid,'Trả toàn bộ hàng','fb000000-0000-4000-8000-000000000109',
  current_setting('test.seed_mixed_preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'Mixed cancellation retry is idempotent');
select is((select stock_base from public.products where id=current_setting('test.seed_product')::uuid),4900::bigint,
  'Mixed cancellation restores exactly 1001 grams while preserving the 100 gram count loss');
select is((public.management_report(current_setting('test.seed_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  0::bigint,'Mixed cancellation reverses both sale line cost snapshots');
select set_config('test.legacy_seed',public.save_product(current_setting('test.seed_store')::uuid,'Hạt cũ','Hạt','seeds','lạng',
  '[{"key":"base","name":"lạng","factor":1,"sale_price":15000,"can_sell":true},
    {"key":"pack","name":"kg","factor":10,"purchase_price":100000,"can_purchase":true}]',50)::text,true);
select is((select stock_base from public.products where id=current_setting('test.legacy_seed')::uuid),50::bigint,'Legacy seed retains 50 lang without migration conversion');
select throws_ok(format($$ select public.save_product(%L::uuid,'Hạt cũ','Hạt','seeds','gram',%L::jsonb,0,500,true,%L::uuid) $$,
  current_setting('test.seed_store'),current_setting('test.seed_units'),current_setting('test.legacy_seed')),
  'P0001','Mặt hàng còn tồn kho nên chưa thể đổi đơn vị nhỏ nhất.','Legacy seed cannot silently change base unit');
reset role;
select is((select average_cost_per_base from public.products where id=current_setting('test.legacy_seed')::uuid),null::numeric,'Legacy opening cost stays unknown');
set local role authenticated;
select set_config('request.jwt.claim.sub','fb000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.products where id=current_setting('test.seed_product')::uuid),0::bigint,'Different user cannot read seed stock');
select throws_ok(format($$ select public.create_sale(%L::uuid,'fb000000-0000-4000-8000-000000000108',
  '[{"product_id":"%s","unit_key":"pack","quantity":1}]') $$,current_setting('test.seed_store'),current_setting('test.seed_product')),
  'P0001','Bạn không có quyền với cửa hàng này.','Different user cannot sell seed stock');

select * from finish();
rollback;
