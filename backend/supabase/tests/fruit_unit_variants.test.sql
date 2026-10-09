begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
  ('fc000000-0000-4000-8000-000000000001','fruit-units-owner@example.invalid','{}'),
  ('fc000000-0000-4000-8000-000000000002','fruit-units-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('test.variant_store',public.create_store('Fruit unit variants','fruit_shop')::text,true);
do $$ declare u text; begin
  foreach u in array array['quả','trái','hộp','khay','túi','thùng'] loop
    perform public.save_product(current_setting('test.variant_store')::uuid,'Đếm theo '||u,'Trái cây','fruit',u,
      jsonb_build_array(jsonb_build_object('key','base','name',u,'factor',1,'purchase_price',20000,'sale_price',30000,'can_purchase',true,'can_sell',true)),0,5);
  end loop;
end $$;
select is((select count(distinct base_unit) from public.products where store_id=current_setting('test.variant_store')::uuid),6::bigint,
  'All six counted fruit units save as fruit without a gram conversion');
select set_config('test.variant_weight',public.save_product(current_setting('test.variant_store')::uuid,'Táo nhiều đơn vị','Táo','fruit','gram',
  '[{"key":"base","name":"gram","factor":1,"sale_price":200,"can_purchase":false,"can_sell":true},
    {"key":"kg","name":"kg","factor":1000,"purchase_price":120000,"sale_price":180000,"can_purchase":true,"can_sell":true},
    {"key":"lang","name":"lạng","factor":100,"sale_price":17000,"can_purchase":false,"can_sell":true},
    {"key":"pack","name":"khay","factor":500,"purchase_price":90000,"sale_price":100000,"can_purchase":true,"can_sell":true}]',0,5000)::text,true);
select lives_ok($$ select public.receive_stock(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000101',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','kg','quantity',2,'unit_cost',120000))) $$,
  'Weighted fruit initially receives kg');
select set_config('test.variant_items',jsonb_build_array(
  jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','kg','quantity',0.5),
  jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','lang','quantity',1),
  jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','base','quantity',20),
  jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','pack','quantity',1))::text,true);
select set_config('test.variant_sale',public.create_sale(current_setting('test.variant_store')::uuid,
  'fc000000-0000-4000-8000-000000000102',current_setting('test.variant_items')::jsonb)::text,true);
select is((current_setting('test.variant_sale')::jsonb->>'total_amount')::bigint,211000::bigint,'Kg/lang/gram/tray sale uses four independent prices');
select is((select stock_base from public.products where id=current_setting('test.variant_weight')::uuid),880::bigint,'Four units remove 1120 grams from the single stock');
select ok((public.create_sale(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000102',
  current_setting('test.variant_items')::jsonb)->>'duplicate')::boolean,'Multi-unit fruit sale retry is idempotent');
reset role;
select results_eq($$ select unit_name,base_quantity,unit_price,line_total from public.sale_items
  where sale_id=(current_setting('test.variant_sale')::jsonb->>'sale_id')::uuid order by unit_key $$,
  $$ values ('gram'::text,20::bigint,200::bigint,4000::bigint),('kg'::text,500::bigint,180000::bigint,90000::bigint),
    ('lạng'::text,100::bigint,17000::bigint,17000::bigint),('khay'::text,500::bigint,100000::bigint,100000::bigint) $$,
  'Historical fruit items snapshot each conversion and price');
select is((select sum(cost_total) from public.sale_items where sale_id=(current_setting('test.variant_sale')::jsonb->>'sale_id')::uuid),
  134400::numeric,'Four fruit lines use snapshotted 120 VND/gram COGS');
set local role authenticated;
select is((public.management_report(current_setting('test.variant_store')::uuid,1)->'totals'->>'gross_profit')::bigint,
  76600::bigint,'Mixed fruit profit is calculated server-side');
select set_config('test.variant_preview',public.preview_sale_cancellation(current_setting('test.variant_store')::uuid,
  (current_setting('test.variant_sale')::jsonb->>'sale_id')::uuid)::text,true);
select lives_ok($$ select public.cancel_sale_confirmed(current_setting('test.variant_store')::uuid,
  (current_setting('test.variant_sale')::jsonb->>'sale_id')::uuid,'Trả toàn bộ hàng','fc000000-0000-4000-8000-000000000103',
  current_setting('test.variant_preview')::jsonb->>'preview_token') $$,'Mixed fruit cancellation commits atomically');
select ok((public.cancel_sale_confirmed(current_setting('test.variant_store')::uuid,
  (current_setting('test.variant_sale')::jsonb->>'sale_id')::uuid,'Trả toàn bộ hàng','fc000000-0000-4000-8000-000000000103',
  current_setting('test.variant_preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'Mixed fruit cancellation retry cannot restore stock twice');
select is((select stock_base from public.products where id=current_setting('test.variant_weight')::uuid),2000::bigint,'Cancellation restores the exact original gram stock');
select is((public.receive_stock(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000104',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.variant_weight'),'unit_key','pack','quantity',2,'unit_cost',95000)))->>'total_cost')::bigint,
  190000::bigint,'Tray receipt uses price per tray, not price per kg');
select is((select stock_base from public.products where id=current_setting('test.variant_weight')::uuid),3000::bigint,'Two 500 gram trays add 1000 grams');
select is((select (u->>'purchase_price')::bigint from jsonb_array_elements(public.catalog_product_units(current_setting('test.variant_store')::uuid,current_setting('test.variant_weight')::uuid)) u where u->>'key'='kg'),
  120000::bigint,'Tray cost does not overwrite kg purchase quote');
select is((select (u->>'purchase_price')::bigint from jsonb_array_elements(public.catalog_product_units(current_setting('test.variant_store')::uuid,current_setting('test.variant_weight')::uuid)) u where u->>'key'='pack'),
  95000::bigint,'Tray purchase quote updates separately');
reset role;
select is((select average_cost_per_base from public.products where id=current_setting('test.variant_weight')::uuid),
  143.33333333::numeric,'Weighted average combines kg and tray costs over the same gram stock');
set local role authenticated;

select set_config('test.variant_piece',public.save_product(current_setting('test.variant_store')::uuid,'Dưa theo quả','Dưa','fruit','quả',
  '[{"key":"base","name":"quả","factor":1,"purchase_price":20000,"sale_price":30000,"can_purchase":true,"can_sell":true},
    {"key":"pack","name":"thùng","factor":12,"purchase_price":240000,"sale_price":320000,"can_purchase":true,"can_sell":true}]',0,5)::text,true);
select is((select c.name from public.products p join public.categories c on c.id=p.category_id and c.store_id=p.store_id
  where p.id=current_setting('test.variant_piece')::uuid),'Dưa','Custom category links within the shop independently of fruit pricing group');
select lives_ok($$ select public.receive_stock(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000105',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.variant_piece'),'unit_key','pack','quantity',2,'unit_cost',240000))) $$,
  'Counted fruit receives cartons without requiring kg');
select set_config('test.variant_piece_sale',public.create_sale(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000106',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.variant_piece'),'unit_key','pack','quantity',1),
    jsonb_build_object('product_id',current_setting('test.variant_piece'),'unit_key','base','quantity',2)))::text,true);
select is((current_setting('test.variant_piece_sale')::jsonb->>'total_amount')::bigint,380000::bigint,'One carton and two pieces retain the carton discount');
select is((select stock_base from public.products where id=current_setting('test.variant_piece')::uuid),10::bigint,'Counted fruit mixed sale removes 14 of 24 pieces');
reset role;
select is((select sum(cost_total) from public.sale_items where sale_id=(current_setting('test.variant_piece_sale')::jsonb->>'sale_id')::uuid),
  280000::numeric,'Counted fruit cost is 20000 VND per piece');
set local role authenticated;
select throws_ok(format($$ select public.create_sale(%L::uuid,'fc000000-0000-4000-8000-000000000107',
  '[{"product_id":"%s","unit_key":"base","quantity":0.5}]') $$,current_setting('test.variant_store'),current_setting('test.variant_piece')),
  'P0001','Số lượng Dưa theo quả chưa quy đổi thành đơn vị kho nguyên.','Fractional piece stock is rejected by PostgreSQL');
select is((select stock_base from public.products where id=current_setting('test.variant_piece')::uuid),10::bigint,'Rejected fractional piece sale leaves stock intact');
select set_config('test.variant_piece_preview',public.preview_sale_cancellation(current_setting('test.variant_store')::uuid,
  (current_setting('test.variant_piece_sale')::jsonb->>'sale_id')::uuid)::text,true);
select lives_ok($$ select public.cancel_sale_confirmed(current_setting('test.variant_store')::uuid,
  (current_setting('test.variant_piece_sale')::jsonb->>'sale_id')::uuid,'Trả hàng','fc000000-0000-4000-8000-000000000108',
  current_setting('test.variant_piece_preview')::jsonb->>'preview_token') $$,'Counted fruit mixed cancellation commits');
select is((select stock_base from public.products where id=current_setting('test.variant_piece')::uuid),24::bigint,'Counted fruit cancellation restores pieces, not grams');

select set_config('test.variant_csv','[{"product":{"name":"Nho hộp CSV","category":"Nho","product_group":"fruit","base_unit":"hộp","low_stock_threshold":5,
  "units":[{"key":"base","name":"hộp","factor":1,"purchase_price":100000,"sale_price":150000,"can_purchase":true,"can_sell":true}]},
  "unit_key":"base","quantity":4,"unit_cost":100000}]',true);
select lives_ok($$ select public.import_stock_csv(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000109',
  current_setting('test.variant_csv')::jsonb) $$,'CSV creates counted fruit and valued receipt atomically');
select ok((public.import_stock_csv(current_setting('test.variant_store')::uuid,'fc000000-0000-4000-8000-000000000109',
  current_setting('test.variant_csv')::jsonb)->>'duplicate')::boolean,'Counted fruit CSV retry is idempotent');
select is((select stock_base from public.products where store_id=current_setting('test.variant_store')::uuid and name='Nho hộp CSV'),
  4::bigint,'CSV retry does not duplicate counted fruit stock');
reset role;
select is((select average_cost_per_base from public.products where store_id=current_setting('test.variant_store')::uuid and name='Nho hộp CSV'),
  100000::numeric,'CSV cost is per box');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.products where store_id=current_setting('test.variant_store')::uuid),0::bigint,'Other account cannot read weighted or counted fruit stock');
select throws_ok(format($$ select public.receive_stock(%L::uuid,'fc000000-0000-4000-8000-000000000110',
  '[{"product_id":"%s","unit_key":"pack","quantity":1,"unit_cost":95000}]') $$,
  current_setting('test.variant_store'),current_setting('test.variant_weight')),
  'P0001','Bạn không có quyền với cửa hàng này.','Other account cannot receive trays');
select * from finish();
rollback;
