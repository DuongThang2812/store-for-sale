-- Exact numeric examples from requirements 99-109. Example 102's arithmetic
-- is corrected: 100 - (2 * 24 + 4) = 48 remaining, 52 sold.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9200000-0000-4000-8000-000000000001','acceptance-owner@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9200000-0000-4000-8000-000000000001',true);
select set_config('test.example_store',public.create_store('Grocery numeric acceptance','grocery')::text,true);
do $$ declare n integer; p uuid; r jsonb; begin for n in 1..3 loop
 p := public.save_product(current_setting('test.example_store')::uuid,'Coca case '||n,'Nước','drinks','chai',
  '[{"key":"base","name":"chai","factor":1,"purchase_price":7500,"sale_price":10000,"can_purchase":true,"can_sell":true},
    {"key":"pack","name":"thùng","factor":24,"purchase_price":180000,"sale_price":225000,"can_purchase":true,"can_sell":true}]',0,5);
 perform set_config('test.example_coca'||n,p::text,true);
 r := public.receive_stock(current_setting('test.example_store')::uuid,extensions.gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('product_id',p,'unit_key','pack','quantity',2,'unit_cost',180000)));
 perform set_config('test.example_receipt'||n,r::text,true);
 end loop; end $$;
select is((select stock_base from public.products where id=current_setting('test.example_coca1')::uuid),48::bigint,'105: two cartons add exactly 48 bottles');
select is((current_setting('test.example_receipt1')::jsonb->>'total_cost')::bigint,360000::bigint,'105: two cartons cost exactly 360000 VND');
reset role;
select is((select average_cost_per_base from public.products where id=current_setting('test.example_coca1')::uuid),7500::numeric,'105: weighted average is 7500 VND per bottle');
set local role authenticated;
select public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000101',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_coca1'),'unit_key','pack','quantity',1)));
select is((select stock_base from public.products where id=current_setting('test.example_coca1')::uuid),24::bigint,'99: 48 bottles minus one carton leaves 24');
select public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000102',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_coca2'),'unit_key','pack','quantity',1),
   jsonb_build_object('product_id',current_setting('test.example_coca2'),'unit_key','base','quantity',3)));
select is((select stock_base from public.products where id=current_setting('test.example_coca2')::uuid),21::bigint,'100: mixed carton plus 3 bottles leaves 21');
select set_config('test.example_price_sale',public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000103',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_coca3'),'unit_key','pack','quantity',1),
   jsonb_build_object('product_id',current_setting('test.example_coca3'),'unit_key','base','quantity',2)))::text,true);
select is((current_setting('test.example_price_sale')::jsonb->>'total_amount')::bigint,245000::bigint,'101: carton price 225000 plus two bottles at 10000 is 245000');
reset role;
select is((select sum(cost_total) from public.sale_items where sale_id=(current_setting('test.example_price_sale')::jsonb->>'sale_id')::uuid),195000::numeric,'101: mixed sale snapshots the cost of 26 bottles');
select is((select sum(base_quantity) from public.sale_items where sale_id=(current_setting('test.example_price_sale')::jsonb->>'sale_id')::uuid),26::numeric,'101: mixed units remove 26 base units');
set local role authenticated;

select set_config('test.example_beer',public.save_product(current_setting('test.example_store')::uuid,'Tiger','Bia','beer','lon',
 '[{"key":"base","name":"lon","factor":1,"purchase_price":7500,"sale_price":10000,"can_purchase":true,"can_sell":true},
   {"key":"pack","name":"thùng","factor":24,"purchase_price":180000,"sale_price":225000,"can_purchase":true,"can_sell":true}]',0,5)::text,true);
select public.receive_stock(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000104',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_beer'),'unit_key','base','quantity',100,'unit_cost',7500)));
select set_config('test.example_beer_sale',public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000105',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_beer'),'unit_key','pack','quantity',2),
   jsonb_build_object('product_id',current_setting('test.example_beer'),'unit_key','base','quantity',4)))::text,true);
select is((select stock_base from public.products where id=current_setting('test.example_beer')::uuid),48::bigint,'102: 100 cans minus 52 sold leaves 48 (corrected example)');
select is((select sum(base_quantity) from public.sale_items where sale_id=(current_setting('test.example_beer_sale')::jsonb->>'sale_id')::uuid),52::numeric,'102: 2 cartons plus 4 cans is 52 sold, not 52 remaining');

select set_config('test.example_tobacco',public.save_product(current_setting('test.example_store')::uuid,'Thuốc lá','Thuốc lá','tobacco','gói',
 '[{"key":"base","name":"gói","factor":1,"purchase_price":10000,"sale_price":15000,"can_purchase":true,"can_sell":true},
   {"key":"pack","name":"cây","factor":10,"purchase_price":100000,"sale_price":140000,"can_purchase":true,"can_sell":true}]',0,5)::text,true);
select public.receive_stock(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000106',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_tobacco'),'unit_key','pack','quantity',3,'unit_cost',100000)));
select set_config('test.example_tobacco_sale',public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000107',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_tobacco'),'unit_key','pack','quantity',1),
   jsonb_build_object('product_id',current_setting('test.example_tobacco'),'unit_key','base','quantity',2)))::text,true);
select is((select stock_base from public.products where id=current_setting('test.example_tobacco')::uuid),18::bigint,'103: 30 packs minus one carton and 2 packs leaves 18');
select is((select sum(base_quantity) from public.sale_items where sale_id=(current_setting('test.example_tobacco_sale')::jsonb->>'sale_id')::uuid),12::numeric,'103: carton and retail pack share one stock');

select public.receive_stock(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000108',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_coca3'),'unit_key','pack','quantity',2,'unit_cost',180000)));
select set_config('test.example_customer',public.save_customer(current_setting('test.example_store')::uuid,'Khách ví dụ')::text,true);
select set_config('test.example_credit',public.create_sale(current_setting('test.example_store')::uuid,'f9200000-0000-4000-8000-000000000109',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_coca3'),'unit_key','pack','quantity',2),
   jsonb_build_object('product_id',current_setting('test.example_coca3'),'unit_key','base','quantity',5)),
 'credit',current_setting('test.example_customer')::uuid)::text,true);
select is((select current_debt from public.customers where id=current_setting('test.example_customer')::uuid),500000::bigint,'108: credit starts with debt 500000');
select set_config('test.example_before_payment',public.management_report(current_setting('test.example_store')::uuid,1)::text,true);
select public.record_debt_payment(current_setting('test.example_store')::uuid,current_setting('test.example_customer')::uuid,
 200000,'f9200000-0000-4000-8000-000000000110');
select set_config('test.example_after_payment',public.management_report(current_setting('test.example_store')::uuid,1)::text,true);
select is((select current_debt from public.customers where id=current_setting('test.example_customer')::uuid),300000::bigint,'108: partial payment leaves debt 300000');
select is((current_setting('test.example_after_payment')::jsonb#>>'{totals,cash_collected}')::bigint
 -(current_setting('test.example_before_payment')::jsonb#>>'{totals,cash_collected}')::bigint,200000::bigint,'108: collection increases cash by 200000');
select is(current_setting('test.example_after_payment')::jsonb#>'{totals,revenue}',current_setting('test.example_before_payment')::jsonb#>'{totals,revenue}','108: payment never increases sales revenue');
select is(current_setting('test.example_after_payment')::jsonb#>'{totals,sales_count}',current_setting('test.example_before_payment')::jsonb#>'{totals,sales_count}','108: collection does not create a sale');
select set_config('test.example_preview',public.preview_sale_cancellation(current_setting('test.example_store')::uuid,
 (current_setting('test.example_credit')::jsonb->>'sale_id')::uuid)::text,true);
select is((current_setting('test.example_preview')::jsonb->>'debt_reduction')::bigint,300000::bigint,'109: server preview reduces only remaining debt');
select is((current_setting('test.example_preview')::jsonb->>'refund_amount')::bigint,200000::bigint,'109: server preview refunds only paid amount');
select public.cancel_sale_confirmed(current_setting('test.example_store')::uuid,(current_setting('test.example_credit')::jsonb->>'sale_id')::uuid,
 'Numeric acceptance','f9200000-0000-4000-8000-000000000111',current_setting('test.example_preview')::jsonb->>'preview_token');
select is((select stock_base from public.products where id=current_setting('test.example_coca3')::uuid),70::bigint,'109: cancellation restores the exact pre-credit stock');
select is((select current_debt from public.customers where id=current_setting('test.example_customer')::uuid),0::bigint,'109: remaining debt is removed');
select ok((public.cancel_sale_confirmed(current_setting('test.example_store')::uuid,(current_setting('test.example_credit')::jsonb->>'sale_id')::uuid,
 'Numeric acceptance','f9200000-0000-4000-8000-000000000111',current_setting('test.example_preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'109: same cancellation request is idempotent');
select is((select stock_base from public.products where id=current_setting('test.example_coca3')::uuid),70::bigint,'109: cancellation retry never restores stock twice');
select set_config('test.example_after_cancel',public.management_report(current_setting('test.example_store')::uuid,1)::text,true);
select is((current_setting('test.example_after_payment')::jsonb#>>'{totals,revenue}')::bigint
 -(current_setting('test.example_after_cancel')::jsonb#>>'{totals,revenue}')::bigint,500000::bigint,'109: revenue reverses exactly one cancelled sale');
select is((current_setting('test.example_after_payment')::jsonb#>>'{totals,cogs}')::bigint
 -(current_setting('test.example_after_cancel')::jsonb#>>'{totals,cogs}')::bigint,397500::bigint,'109: COGS reverses historical cost of 53 bottles');
select is((current_setting('test.example_after_payment')::jsonb#>>'{totals,cash_collected}')::bigint
 -(current_setting('test.example_after_cancel')::jsonb#>>'{totals,cash_collected}')::bigint,200000::bigint,'109: cash records refund 200000 once');

select set_config('test.example_fruit_store',public.create_store('Fruit numeric acceptance','fruit_shop')::text,true);
select set_config('test.example_fruit',public.save_product(current_setting('test.example_fruit_store')::uuid,'Táo','Táo','fruit','gram',
 '[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false},
   {"key":"kg","name":"kg","factor":1000,"purchase_price":100000,"sale_price":180000,"can_purchase":true,"can_sell":true}]',0,1000)::text,true);
select public.receive_stock(current_setting('test.example_fruit_store')::uuid,'f9200000-0000-4000-8000-000000000112',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_fruit'),'unit_key','kg','quantity',15.5,'unit_cost',100000)));
select set_config('test.example_fruit_sale',public.create_sale(current_setting('test.example_fruit_store')::uuid,'f9200000-0000-4000-8000-000000000113',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.example_fruit'),'unit_key','kg','quantity',1.35)))::text,true);
select is((current_setting('test.example_fruit_sale')::jsonb->>'total_amount')::bigint,243000::bigint,'106: 1.35 kg at 180000 costs 243000');
select is((public.management_report(current_setting('test.example_fruit_store')::uuid,1)#>>'{totals,cogs}')::bigint,135000::bigint,'106: COGS is 135000 from the 100000/kg snapshot');
select is((public.management_report(current_setting('test.example_fruit_store')::uuid,1)#>>'{totals,gross_profit}')::bigint,108000::bigint,'106: gross profit is 108000');
select is((select stock_base from public.products where id=current_setting('test.example_fruit')::uuid),14150::bigint,'106: sale removes exactly 1350 grams');
select public.cancel_sale_confirmed(current_setting('test.example_fruit_store')::uuid,(current_setting('test.example_fruit_sale')::jsonb->>'sale_id')::uuid,
 'Restore spoilage fixture','f9200000-0000-4000-8000-000000000114',public.preview_sale_cancellation(current_setting('test.example_fruit_store')::uuid,
 (current_setting('test.example_fruit_sale')::jsonb->>'sale_id')::uuid)->>'preview_token');
select is((select stock_base from public.products where id=current_setting('test.example_fruit')::uuid),15500::bigint,'109: weighted cancellation restores exact grams');
select public.adjust_stock(current_setting('test.example_fruit_store')::uuid,current_setting('test.example_fruit')::uuid,-1200,'spoiled',
 'f9200000-0000-4000-8000-000000000115');
select is((select stock_base from public.products where id=current_setting('test.example_fruit')::uuid),14300::bigint,'107: 15.5 kg minus 1.2 kg spoilage leaves 14.3 kg');
select is((public.shop_dashboard(current_setting('test.example_fruit_store')::uuid)#>>'{spoilage,value}')::bigint,120000::bigint,'107: spoilage costs 120000 at snapshot cost');
select is((select quantity_base from public.stock_movements where client_request_id='f9200000-0000-4000-8000-000000000115'),-1200::bigint,'107: exact negative movement is recorded');
select * from finish();
rollback;
