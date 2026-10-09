begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9100000-0000-4000-8000-000000000001','dashboard-owner@example.invalid','{}'),
 ('f9100000-0000-4000-8000-000000000002','dashboard-staff@example.invalid','{}'),
 ('f9100000-0000-4000-8000-000000000003','dashboard-other@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
select set_config('test.dash_store',public.create_store('Dashboard fruit','fruit_shop')::text,true);
select set_config('test.dash_weight',public.save_product(current_setting('test.dash_store')::uuid,'Táo','Trái cây','fruit','gram',
 '[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false},
   {"key":"kg","name":"kg","factor":1000,"purchase_price":30000,"sale_price":50000,"can_purchase":true,"can_sell":true}]',0,8000)::text,true);
select set_config('test.dash_count',public.save_product(current_setting('test.dash_store')::uuid,'Dừa','Trái cây','fruit','quả',
 '[{"key":"base","name":"quả","factor":1,"purchase_price":20000,"sale_price":30000,"can_purchase":true,"can_sell":true}]',0,2)::text,true);
select set_config('test.dash_unknown',public.save_product(current_setting('test.dash_store')::uuid,'Tồn cũ chưa định giá','Trái cây','fruit','quả',
 '[{"key":"base","name":"quả","factor":1,"purchase_price":20000,"sale_price":30000,"can_purchase":true,"can_sell":true}]',3,5)::text,true);
select public.receive_stock(current_setting('test.dash_store')::uuid,'f9100000-0000-4000-8000-000000000101',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.dash_weight'),'unit_key','kg','quantity',10,'unit_cost',30000),
   jsonb_build_object('product_id',current_setting('test.dash_count'),'unit_key','base','quantity',10,'unit_cost',20000)));
select public.create_sale(current_setting('test.dash_store')::uuid,'f9100000-0000-4000-8000-000000000102',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.dash_weight'),'unit_key','kg','quantity',2)));
select set_config('test.dash_customer',public.save_customer(current_setting('test.dash_store')::uuid,'Khách nợ')::text,true);
select public.create_sale(current_setting('test.dash_store')::uuid,'f9100000-0000-4000-8000-000000000103',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.dash_count'),'unit_key','base','quantity',2)),
 'credit',current_setting('test.dash_customer')::uuid);
select set_config('test.dash_kg_spoil',(public.adjust_stock(current_setting('test.dash_store')::uuid,
 current_setting('test.dash_weight')::uuid,-1000,'spoiled','f9100000-0000-4000-8000-000000000104')->>'movement_id'),true);
select public.adjust_stock(current_setting('test.dash_store')::uuid,current_setting('test.dash_count')::uuid,-1,'spoiled',
 'f9100000-0000-4000-8000-000000000105');
select public.adjust_stock(current_setting('test.dash_store')::uuid,current_setting('test.dash_weight')::uuid,-500,'lost',
 'f9100000-0000-4000-8000-000000000106','spoiled');
select set_config('test.dash',public.shop_dashboard(current_setting('test.dash_store')::uuid)::text,true);
select is((current_setting('test.dash')::jsonb#>>'{report,totals,revenue}')::bigint,160000::bigint,'Owner revenue is DB sale total');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,cash_collected}')::bigint,100000::bigint,'Credit sale does not inflate cash');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,cogs}')::bigint,100000::bigint,'COGS comes from sale snapshots');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,gross_profit}')::bigint,60000::bigint,'Gross profit excludes spoilage and operating expenses');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,gross_margin_percent}')::numeric,37.5::numeric,'Gross margin is computed by PostgreSQL');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,sales_count}')::bigint,2::bigint,'Orders count is exact');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,outstanding_debt}')::bigint,60000::bigint,'Debt is current DB balance');
select is((current_setting('test.dash')::jsonb->>'debt_customer_count')::bigint,1::bigint,'Debt customer count is server scoped');
select is(current_setting('test.dash')::jsonb#>>'{report,timezone}','Asia/Ho_Chi_Minh','Dashboard uses shop timezone');
select is(current_setting('test.dash')::jsonb#>'{spoilage,quantity_by_unit}',
 '[{"base_unit":"gram","quantity_base":1000},{"base_unit":"quả","quantity_base":1}]'::jsonb,'Spoilage keeps grams and counted fruits separate');
select is((current_setting('test.dash')::jsonb#>>'{spoilage,value}')::bigint,50000::bigint,'Only structured spoilage is valued; lost with spoilage note is excluded');
select is((current_setting('test.dash')::jsonb#>>'{spoilage,movement_count}')::bigint,2::bigint,'Spoilage movements counted once');
select is(jsonb_array_length(current_setting('test.dash')::jsonb->'recent_stock_receipts'),1,'Recent imports are returned');
select is((current_setting('test.dash')::jsonb#>>'{recent_stock_receipts,0,item_count}')::bigint,2::bigint,'Receipt line count does not multiply receipt cost');
select is((current_setting('test.dash')::jsonb#>>'{recent_stock_receipts,0,total_cost}')::bigint,500000::bigint,'Receipt cost is DB total');
select is(jsonb_array_length(current_setting('test.dash')::jsonb#>'{report,top_products_by_revenue}'),2,'Top products are DB sales, not sample data');

select set_config('test.dash_unknown_spoil',(public.adjust_stock(current_setting('test.dash_store')::uuid,
 current_setting('test.dash_unknown')::uuid,-1,'spoiled','f9100000-0000-4000-8000-000000000107')->>'movement_id'),true);
select set_config('test.dash',public.shop_dashboard(current_setting('test.dash_store')::uuid)::text,true);
select is(current_setting('test.dash')::jsonb#>'{spoilage,value}','null'::jsonb,'Unknown opening cost makes full spoilage value NULL');
select ok(not (current_setting('test.dash')::jsonb#>>'{spoilage,cost_data_complete}')::boolean,'Unknown loss has explicit incomplete flag');
select is((current_setting('test.dash')::jsonb#>>'{spoilage,unvalued_movements}')::bigint,1::bigint,'Unknown cost count is reported');

-- Fixture timestamp changes are made only by the isolated test's privileged role.
reset role;
update public.stock_movements set created_at=((now() at time zone 'Asia/Ho_Chi_Minh')::date)::timestamp at time zone 'Asia/Ho_Chi_Minh'
 where id=current_setting('test.dash_kg_spoil')::uuid;
update public.stock_movements set created_at=(((now() at time zone 'Asia/Ho_Chi_Minh')::date)+1)::timestamp at time zone 'Asia/Ho_Chi_Minh'
 where id=current_setting('test.dash_unknown_spoil')::uuid;
set local role authenticated;
select set_config('test.dash',public.shop_dashboard(current_setting('test.dash_store')::uuid)::text,true);
select is((current_setting('test.dash')::jsonb#>>'{spoilage,value}')::bigint,50000::bigint,'Vietnam midnight is inclusive; next midnight is exclusive');
select public.receive_stock(current_setting('test.dash_store')::uuid,'f9100000-0000-4000-8000-000000000108',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.dash_weight'),'unit_key','kg','quantity',1,'unit_cost',90000)));
select is((public.shop_dashboard(current_setting('test.dash_store')::uuid)#>>'{spoilage,value}')::bigint,50000::bigint,'Later average-cost change cannot revalue past spoilage');

do $$ declare n integer; begin for n in 1..12 loop
 perform public.save_product(current_setting('test.dash_store')::uuid,'Dashboard bounded '||n,'Trái cây','fruit','quả',
  '[{"key":"base","name":"quả","factor":1,"purchase_price":20000,"sale_price":30000,"can_purchase":true,"can_sell":true}]',2,5);
 perform public.receive_stock(current_setting('test.dash_store')::uuid,extensions.gen_random_uuid(),
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.dash_count'),'unit_key','base','quantity',1,'unit_cost',20000)));
 end loop; end $$;
select set_config('test.dash',public.shop_dashboard(current_setting('test.dash_store')::uuid)::text,true);
select is(jsonb_array_length(current_setting('test.dash')::jsonb->'high_stock_products'),10,'High stock list is bounded');
select is(jsonb_array_length(current_setting('test.dash')::jsonb->'low_stock_products'),5,'Low stock list is bounded');
select is(jsonb_array_length(current_setting('test.dash')::jsonb->'recent_stock_receipts'),10,'Recent receipts list is bounded');
select is((current_setting('test.dash')::jsonb#>>'{report,totals,low_stock_count}')::bigint,14::bigint,'Low-stock metric counts all DB rows, not only five displayed rows');
select public.save_store_staff(current_setting('test.dash_store')::uuid,'f9100000-0000-4000-8000-000000000109','dashboard-staff@example.invalid');
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000002',true);
select throws_ok(format('select public.shop_dashboard(%L::uuid)',current_setting('test.dash_store')),
 '42501',null,'Staff cannot read owner financial dashboard');
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000003',true);
select throws_ok(format('select public.shop_dashboard(%L::uuid)',current_setting('test.dash_store')),
 '42501',null,'Another tenant cannot read owner dashboard');
select set_config('test.dash_other',public.create_store('Unrelated grocery','grocery')::text,true);
select is((public.shop_dashboard(current_setting('test.dash_other')::uuid)#>>'{report,totals,revenue}')::bigint,0::bigint,'Empty tenant does not inherit another shop revenue');
select is(public.shop_dashboard(current_setting('test.dash_other')::uuid)->'recent_stock_receipts','[]'::jsonb,'Empty tenant does not inherit imports');
select is(public.shop_dashboard(current_setting('test.dash_other')::uuid)#>'{spoilage,quantity_by_unit}','[]'::jsonb,'Empty tenant does not inherit spoilage');
reset role;
update public.profiles set account_status='disabled' where id='f9100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f9100000-0000-4000-8000-000000000001',true);
select throws_ok(format('select public.shop_dashboard(%L::uuid)',current_setting('test.dash_store')),
 '42501',null,'Disabled owner cannot read cached financial API');
reset role;
set local role anon;
select throws_ok(format('select public.shop_dashboard(%L::uuid)',current_setting('test.dash_store')),
 '42501',null,'Anonymous has no execute grant');
select * from finish();
rollback;
