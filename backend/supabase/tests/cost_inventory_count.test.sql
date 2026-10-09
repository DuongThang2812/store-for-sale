begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('f3000000-0000-4000-8000-000000000001', 'cost-owner@example.invalid', '{}'::jsonb),
  ('f3000000-0000-4000-8000-000000000002', 'cost-staff@example.invalid', '{}'::jsonb),
  ('f3000000-0000-4000-8000-000000000003', 'other-owner@example.invalid', '{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select set_config('test.cost_store', public.create_store('Cost test')::text, true);
select set_config('test.coca', public.save_product(
  current_setting('test.cost_store')::uuid, 'Coca test', 'Nước', 'other', 'lon',
  '[{"key":"base","name":"lon","factor":1,"purchase_price":10000,"sale_price":15000,"can_purchase":true,"can_sell":true}]'::jsonb,
  0
)::text, true);
select lives_ok(format($$ select public.receive_stock(%L::uuid,
  'f3000000-0000-4000-8000-000000000101'::uuid,
  '[{"product_id":"%s","unit_key":"base","quantity":10,"unit_cost":10000}]'::jsonb) $$,
  current_setting('test.cost_store'), current_setting('test.coca')),
  'First stock receipt commits');
select lives_ok(format($$ select public.receive_stock(%L::uuid,
  'f3000000-0000-4000-8000-000000000102'::uuid,
  '[{"product_id":"%s","unit_key":"base","quantity":10,"unit_cost":12000}]'::jsonb) $$,
  current_setting('test.cost_store'), current_setting('test.coca')),
  'Second receipt uses another cost');

reset role;
select is((select average_cost_per_base from public.products where id = current_setting('test.coca')::uuid),
  11000::numeric, 'Weighted average is 11000 VND per lon');
select is((select stock_base from public.products where id = current_setting('test.coca')::uuid),
  20::bigint, 'Receipts added 20 lon');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select lives_ok(format($$ select public.create_sale(%L::uuid,
  'f3000000-0000-4000-8000-000000000103'::uuid,
  '[{"product_id":"%s","unit_key":"base","quantity":2}]'::jsonb, 'cash', null) $$,
  current_setting('test.cost_store'), current_setting('test.coca')),
  'Cash sale commits');
select is((public.management_report(current_setting('test.cost_store')::uuid, 1)
  -> 'totals' ->> 'gross_profit')::bigint, 8000::bigint,
  'Owner report uses snapshotted COGS for gross profit');
select is((public.management_report(current_setting('test.cost_store')::uuid, 1)
  -> 'totals' ->> 'gross_margin_percent')::numeric, 26.67::numeric,
  'Gross margin uses exact period totals');
reset role;
select results_eq(
  $$ select s.total_amount, i.cost_total, s.total_amount - i.cost_total
     from public.sales s join public.sale_items i on i.sale_id = s.id
     where s.client_request_id = 'f3000000-0000-4000-8000-000000000103' $$,
  $$ values (30000::bigint, 22000::bigint, 8000::bigint) $$,
  'Sale snapshots 30000 revenue, 22000 COGS and 8000 gross profit');
select is((select quantity_base from public.stock_movements where sale_id =
  (select id from public.sales where client_request_id = 'f3000000-0000-4000-8000-000000000103')
  and movement_type = 'sale'), -2::bigint, 'Sale movement records minus two');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select lives_ok(format($$ select public.cancel_sale(%L::uuid,
  (select id from public.sales where client_request_id = 'f3000000-0000-4000-8000-000000000103'),
  'Khách trả lại') $$, current_setting('test.cost_store')),
  'Cancel commits and returns stock');
select is((public.management_report(current_setting('test.cost_store')::uuid, 1)
  -> 'totals' ->> 'gross_profit')::bigint, 0::bigint,
  'Cancellation reverses revenue and COGS in report');
reset role;
select is((select stock_base from public.products where id = current_setting('test.coca')::uuid),
  20::bigint, 'Cancellation restores stock');
select is((select average_cost_per_base from public.products where id = current_setting('test.coca')::uuid),
  11000::numeric, 'Cancellation restores original cost basis');
select is((select count(*) from public.sales where status = 'completed'
  and client_request_id = 'f3000000-0000-4000-8000-000000000103'),
  0::bigint, 'Cancelled sale is excluded from completed revenue');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select is((public.record_inventory_count(current_setting('test.cost_store')::uuid,
  'f3000000-0000-4000-8000-000000000104'::uuid,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('test.coca'),
    'actual_base', 16, 'reason', 'Vỡ 4 lon')), 'Kiểm kho') ->> 'changed_products')::integer,
  1, 'Count changes one product');
select ok((public.record_inventory_count(current_setting('test.cost_store')::uuid,
  'f3000000-0000-4000-8000-000000000104'::uuid,
  jsonb_build_array(jsonb_build_object('product_id', current_setting('test.coca'),
    'actual_base', 16, 'reason', 'Vỡ 4 lon')), 'Kiểm kho') ->> 'duplicate')::boolean,
  'Retrying same count is idempotent');
select throws_ok(format($$ select public.record_inventory_count(%L::uuid,
  'f3000000-0000-4000-8000-000000000104'::uuid,
  '[{"product_id":"%s","actual_base":15,"reason":"Đổi số"}]'::jsonb, 'Kiểm kho') $$,
  current_setting('test.cost_store'), current_setting('test.coca')),
  'P0001', 'Mã yêu cầu đã dùng cho lần kiểm kê khác.', 'Count request ID rejects changed payload');
reset role;
select results_eq(
  $$ select i.system_quantity_base, i.actual_quantity_base, i.difference_base, v.loss_value
     from public.inventory_count_items i
     join public.inventory_adjustment_valuations v on v.movement_id = i.movement_id
     join public.inventory_counts c on c.id = i.count_id
     where c.client_request_id = 'f3000000-0000-4000-8000-000000000104' $$,
  $$ values (20::bigint, 16::bigint, -4::bigint, 44000::bigint) $$,
  'Count records before/after, movement and 44000 VND loss');
select is((select stock_base from public.products where id = current_setting('test.coca')::uuid),
  16::bigint, 'Count leaves physical stock of 16');

-- Known fruit cost normalizes VND/kg to VND/gram and captures exact weighted sale.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select set_config('test.fruit', public.save_product(
  current_setting('test.cost_store')::uuid, 'Táo test', 'Trái cây', 'fruit', 'gram',
  '[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false},
    {"key":"kg","name":"kg","factor":1000,"purchase_price":100000,"sale_price":180000,"can_purchase":true,"can_sell":true}]'::jsonb,
  0
)::text, true);
select lives_ok(format($$ select public.receive_stock(%L::uuid,
  'f3000000-0000-4000-8000-000000000105'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":15.5,"unit_cost":100000}]'::jsonb) $$,
  current_setting('test.cost_store'), current_setting('test.fruit')), 'Fruit receipt commits');
select lives_ok(format($$ select public.create_sale(%L::uuid,
  'f3000000-0000-4000-8000-000000000106'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1.35}]'::jsonb, 'cash', null) $$,
  current_setting('test.cost_store'), current_setting('test.fruit')), 'Fruit sale commits');
reset role;
select results_eq(
  $$ select s.total_amount, i.cost_total, s.total_amount - i.cost_total
     from public.sales s join public.sale_items i on i.sale_id = s.id
     where s.client_request_id = 'f3000000-0000-4000-8000-000000000106' $$,
  $$ values (243000::bigint, 135000::bigint, 108000::bigint) $$,
  '1.35 kg fruit has 243000 revenue, 135000 COGS and 108000 gross profit');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select is((public.adjust_stock(current_setting('test.cost_store')::uuid,
  current_setting('test.fruit')::uuid, -1200, 'spoiled',
  'f3000000-0000-4000-8000-000000000107'::uuid, 'Táo hư') ->> 'balance_after')::bigint,
  12950::bigint, 'Spoiled 1.2 kg leaves 12.95 kg');
reset role;
select is((select v.loss_value from public.inventory_adjustment_valuations v
  join public.stock_movements m on m.id = v.movement_id
  where m.client_request_id = 'f3000000-0000-4000-8000-000000000107'),
  120000::bigint, 'Fruit spoilage snapshots 120000 VND loss');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select (r -> 'totals' ->> 'revenue')::bigint,
      (r -> 'totals' ->> 'cogs')::bigint,
      (r -> 'totals' ->> 'gross_profit')::bigint,
      (r -> 'totals' ->> 'loss_value')::bigint
     from (select public.management_report(current_setting('test.cost_store')::uuid, 1) r) x $$,
  $$ values (243000::bigint, 135000::bigint, 108000::bigint, 164000::bigint) $$,
  'Server report combines fruit profit and count/spoilage loss');
reset role;

insert into public.store_members (store_id, user_id, role)
values (current_setting('test.cost_store')::uuid, 'f3000000-0000-4000-8000-000000000002', 'staff');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000002', true);
select ok(not has_column_privilege('authenticated', 'public.sale_items', 'cost_total', 'SELECT'),
  'Staff cannot SELECT sale COGS directly');
select ok(not has_column_privilege('authenticated', 'public.products', 'average_cost_per_base', 'SELECT'),
  'Staff cannot SELECT weighted cost directly');
select is((select count(*) from public.inventory_counts), 0::bigint,
  'Staff RLS hides inventory count records');
select is((select count(*) from public.inventory_adjustment_valuations), 0::bigint,
  'Staff RLS hides loss values');
select throws_ok(format($$ select public.record_inventory_count(%L::uuid,
  'f3000000-0000-4000-8000-000000000108'::uuid,
  '[{"product_id":"%s","actual_base":16}]'::jsonb) $$,
  current_setting('test.cost_store'), current_setting('test.coca')),
  'P0001', 'Chỉ chủ cửa hàng được kiểm kê kho.', 'Staff cannot invoke count RPC');
select throws_ok(format($$ select public.management_report(%L::uuid, 1) $$,
  current_setting('test.cost_store')),
  'P0001', 'Chỉ chủ cửa hàng được xem báo cáo quản trị.',
  'Staff cannot fetch owner financial report');

select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.inventory_counts), 0::bigint,
  'Other shop user cannot read count records');
select is((select count(*) from public.inventory_adjustment_valuations), 0::bigint,
  'Other shop user cannot read loss values');

-- Old stock remains unvalued until the owner supplies a real cost basis.
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select set_config('test.legacy_product', public.save_product(
  current_setting('test.cost_store')::uuid, 'Hàng tồn cũ', 'Khác', 'other', 'cái',
  '[{"key":"base","name":"cái","factor":1,"sale_price":8000,"can_purchase":false,"can_sell":true}]'::jsonb,
  10
)::text, true);
reset role;
select is((select average_cost_per_base from public.products
  where id = current_setting('test.legacy_product')::uuid), null::numeric,
  'Existing opening stock cost starts unknown');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000001', true);
select is((public.value_opening_stock(current_setting('test.cost_store')::uuid,
  current_setting('test.legacy_product')::uuid, 'base', 5000,
  'f3000000-0000-4000-8000-000000000109'::uuid) ->> 'cost_per_base')::numeric,
  5000::numeric, 'Owner values opening stock explicitly');
select ok((public.value_opening_stock(current_setting('test.cost_store')::uuid,
  current_setting('test.legacy_product')::uuid, 'base', 5000,
  'f3000000-0000-4000-8000-000000000109'::uuid) ->> 'duplicate')::boolean,
  'Opening cost retry is idempotent');
select throws_ok(format($$ select public.value_opening_stock(%L::uuid, %L::uuid,
  'base', 6000, 'f3000000-0000-4000-8000-000000000109'::uuid) $$,
  current_setting('test.cost_store'), current_setting('test.legacy_product')),
  'P0001', 'Mã yêu cầu đã dùng cho định giá khác.', 'Cost request ID rejects changed price');
select lives_ok(format($$ select public.create_sale(%L::uuid,
  'f3000000-0000-4000-8000-000000000110'::uuid,
  '[{"product_id":"%s","unit_key":"base","quantity":2}]'::jsonb, 'cash', null) $$,
  current_setting('test.cost_store'), current_setting('test.legacy_product')),
  'Sale after owner valuation commits');
reset role;
select is((select i.cost_total from public.sale_items i join public.sales s on s.id = i.sale_id
  where s.client_request_id = 'f3000000-0000-4000-8000-000000000110'),
  10000::bigint, 'Future sale uses owner-entered cost; old sales stay unchanged');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f3000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.opening_cost_valuations), 0::bigint,
  'Staff cannot read owner-entered opening valuation');
select throws_ok(format($$ select public.value_opening_stock(%L::uuid, %L::uuid,
  'base', 5000, 'f3000000-0000-4000-8000-000000000111'::uuid) $$,
  current_setting('test.cost_store'), current_setting('test.legacy_product')),
  'P0001', 'Chỉ chủ cửa hàng được định giá tồn đầu kỳ.',
  'Staff cannot value opening stock');

select * from finish();
rollback;
