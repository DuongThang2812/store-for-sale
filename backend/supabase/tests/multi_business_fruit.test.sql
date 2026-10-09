begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('a2000000-0000-4000-8000-000000000001', 'grocery-owner@example.invalid', '{"name":"Grocery owner"}'::jsonb),
  ('b2000000-0000-4000-8000-000000000001', 'fruit-owner@example.invalid', '{"name":"Fruit owner"}'::jsonb),
  ('c2000000-0000-4000-8000-000000000001', 'fruit-staff@example.invalid', '{"name":"Fruit staff"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select set_config('test.grocery_store', public.create_store('Grocery test')::text, true);
select is((select business_type from public.stores where id = current_setting('test.grocery_store')::uuid),
  'grocery', 'One-argument create_store stays grocery');
select set_config('test.grocery_category', public.save_category(current_setting('test.grocery_store')::uuid,
  'Grocery private category')::text, true);
select set_config('test.grocery_supplier', public.save_supplier(current_setting('test.grocery_store')::uuid,
  'Grocery private supplier')::text, true);
select throws_ok($$ select public.create_store('Invalid', 'bank') $$,
  'P0001', 'Loại cửa hàng chưa hợp lệ.', 'Invalid business type is rejected server-side');

select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
select set_config('test.fruit_store', public.create_store('Fruit test', 'fruit_shop')::text, true);
select is((select business_type from public.stores where id = current_setting('test.fruit_store')::uuid),
  'fruit_shop', 'Two-argument create_store sets fruit_shop');
select set_config('test.fruit_category', public.save_category(current_setting('test.fruit_store')::uuid, 'Táo')::text, true);
select set_config('test.fruit_supplier', public.save_supplier(current_setting('test.fruit_store')::uuid,
  'Vựa trái cây', '0900000000', 'Chợ đầu mối', 'Giao buổi sáng')::text, true);
select is((select count(*) from public.categories where id = current_setting('test.fruit_category')::uuid),
  1::bigint, 'Owner creates shop category');
select is((select count(*) from public.suppliers where id = current_setting('test.fruit_supplier')::uuid),
  1::bigint, 'Owner creates shop supplier');
select throws_ok(format($$ select public.save_category(%L::uuid, 'Hijack', %L::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.grocery_category')),
  'P0001', 'Không tìm thấy loại hàng.', 'Other-shop category ID cannot be updated');
select throws_ok(format($$ select public.save_supplier(%L::uuid, 'Hijack', null, null, null, %L::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.grocery_supplier')),
  'P0001', 'Không tìm thấy nhà cung cấp.', 'Other-shop supplier ID cannot be updated');

select set_config('test.fruit_product', public.save_product(
  current_setting('test.fruit_store')::uuid, 'Táo Envy', 'Táo', 'fruit', 'gram',
  '[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false},
    {"key":"kg","name":"kg","factor":1000,"purchase_price":100000,"sale_price":180000,"can_purchase":true,"can_sell":true}]'::jsonb,
  5000
)::text, true);
select is((select category_id from public.products where id = current_setting('test.fruit_product')::uuid),
  current_setting('test.fruit_category')::uuid, 'Fruit product links to its category');
select is((select stock_base from public.products where id = current_setting('test.fruit_product')::uuid),
  5000::bigint, 'Opening fruit stock is stored in grams');
select is((select sale_price from public.product_units where product_id = current_setting('test.fruit_product')::uuid and unit_key = 'kg'),
  180000::bigint, 'Price is stored per kg, not per gram');
select is((select count(*) from public.product_units where product_id = current_setting('test.fruit_product')::uuid and unit_key = 'base' and not can_sell and not can_purchase),
  1::bigint, 'Base gram unit is measurement-only');
select lives_ok(format($$ select public.import_catalog_drafts(%L::uuid,
  'd2000000-0000-4000-8000-000000000099'::uuid,
  '[{"source_id":"FRUIT-DRAFT","name":"Rau thử","category":"Rau tươi","product_group":"other","base_unit":"cái"}]'::jsonb) $$,
  current_setting('test.fruit_store')), 'Legacy catalog import still works');
select is((select count(*) from public.products p join public.categories c on c.id = p.category_id
  where p.store_id = current_setting('test.fruit_store')::uuid and p.name = 'Rau thử'
    and c.name = 'Rau tươi' and not p.is_active),
  1::bigint, 'Imported draft gets normalized category automatically');

select lives_ok(format($$ select public.create_sale(%L::uuid, 'd2000000-0000-4000-8000-000000000001'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1.35}]'::jsonb, 'cash', null) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'Sale accepts 1.35 kg');
select is((select total_amount from public.sales where client_request_id = 'd2000000-0000-4000-8000-000000000001'),
  243000::bigint, '1.35 kg times 180000 VND/kg equals 243000 VND');
select is((select base_quantity from public.sale_items where sale_id =
  (select id from public.sales where client_request_id = 'd2000000-0000-4000-8000-000000000001')),
  1350::bigint, '1.35 kg removes exactly 1350 grams');
select is((select stock_base from public.products where id = current_setting('test.fruit_product')::uuid),
  3650::bigint, 'Fruit stock after sale is exact');
select is((select unit_price from public.sale_items where sale_id =
  (select id from public.sales where client_request_id = 'd2000000-0000-4000-8000-000000000001')),
  180000::bigint, 'Historical sale snapshots VND/kg price');
select throws_ok(format($$ select public.receive_stock(%L::uuid, 'd2000000-0000-4000-8000-000000000098'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1,"unit_cost":120000}]'::jsonb,
  'Cross shop', %L::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product'), current_setting('test.grocery_supplier')),
  'P0001', 'Không tìm thấy nhà cung cấp.', 'Receipt cannot use other-shop supplier ID');
select throws_ok(format($$ select public.create_sale(%L::uuid, 'd2000000-0000-4000-8000-000000000001'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1.34}]'::jsonb, 'cash', null) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Mã yêu cầu đã được dùng cho đơn bán khác.', 'Sale request ID cannot be reused with different quantity');
select throws_ok(format($$ select public.create_sale(%L::uuid, 'd2000000-0000-4000-8000-000000000002'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1.2345}]'::jsonb, 'cash', null) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Số lượng bán phải lớn hơn 0 và tối đa 3 số lẻ.', 'Sale rejects weight beyond gram precision');

select lives_ok(format($$ select public.receive_stock(%L::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":2.5,"unit_cost":120000}]'::jsonb,
  'Lô ngày 1', %L::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product'), current_setting('test.fruit_supplier')),
  'Five-argument receive_stock attaches supplier');
select is((select supplier_id from public.stock_receipts where client_request_id = 'd2000000-0000-4000-8000-000000000003'),
  current_setting('test.fruit_supplier')::uuid, 'Receipt has same-shop supplier');
select is((select unit_cost from public.stock_receipt_items where receipt_id =
  (select id from public.stock_receipts where client_request_id = 'd2000000-0000-4000-8000-000000000003')),
  120000::bigint, 'First receipt snapshots purchase price');
select is((select total_cost from public.stock_receipts where client_request_id = 'd2000000-0000-4000-8000-000000000003'),
  300000::bigint, '2.5 kg at 120000 VND/kg totals 300000 VND');
select throws_ok(format($$ select public.receive_stock(%L::uuid, 'd2000000-0000-4000-8000-000000000003'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":2.4,"unit_cost":120000}]'::jsonb,
  'Lô ngày 1', %L::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product'), current_setting('test.fruit_supplier')),
  'P0001', 'Mã yêu cầu đã được dùng cho phiếu nhập khác.', 'Receipt request ID cannot be reused with different quantity');
select lives_ok(format($$ select public.receive_stock(%L::uuid, 'd2000000-0000-4000-8000-000000000004'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1,"unit_cost":100000}]'::jsonb,
  'Lô ngày 2') $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'Legacy receive_stock can record another price');
select is((select count(distinct unit_cost) from public.stock_receipt_items where product_id = current_setting('test.fruit_product')::uuid),
  2::bigint, 'Purchase history keeps both old and new prices');
reset role;
update public.stock_receipts set request_hash = null
  where client_request_id = 'd2000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-4000-8000-000000000001', true);
select throws_ok(format($$ select public.receive_stock(%L::uuid, 'd2000000-0000-4000-8000-000000000004'::uuid,
  '[{"product_id":"%s","unit_key":"kg","quantity":1,"unit_cost":100000}]'::jsonb,
  'Lô ngày 2') $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.',
  'Unverifiable legacy receipt request ID is rejected');

select is((public.adjust_stock(current_setting('test.fruit_store')::uuid,
  current_setting('test.fruit_product')::uuid, -1200, 'spoiled',
  'd2000000-0000-4000-8000-000000000005'::uuid, 'Táo hư') ->> 'balance_after')::bigint,
  5950::bigint, 'Spoiled 1.2 kg removes 1200 grams');
select is((select count(*) from public.stock_movements where client_request_id = 'd2000000-0000-4000-8000-000000000005' and adjustment_reason = 'spoiled'),
  1::bigint, 'Spoilage creates one movement with reason');
select ok((public.adjust_stock(current_setting('test.fruit_store')::uuid,
  current_setting('test.fruit_product')::uuid, -1200, 'spoiled',
  'd2000000-0000-4000-8000-000000000005'::uuid, 'Táo hư') ->> 'duplicate')::boolean,
  'Retry of same adjustment is idempotent');
select throws_ok(format($$ select public.adjust_stock(%L::uuid, %L::uuid, -1300, 'spoiled',
  'd2000000-0000-4000-8000-000000000005'::uuid, 'Táo hư') $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Mã yêu cầu đã được dùng cho một điều chỉnh khác.', 'Adjustment request ID cannot change payload');
select throws_ok(format($$ select public.adjust_stock(%L::uuid, %L::uuid, 1200, 'spoiled',
  'd2000000-0000-4000-8000-000000000008'::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Hàng hư hoặc hao hụt phải trừ tồn kho.', 'Spoilage cannot increase stock');

reset role;
insert into public.store_members (store_id, user_id, role)
values (current_setting('test.fruit_store')::uuid, 'c2000000-0000-4000-8000-000000000001', 'staff');
insert into public.product_batches (store_id, product_id, receipt_id, supplier_id,
  quantity_received, quantity_remaining, purchase_price, purchase_unit)
values (current_setting('test.fruit_store')::uuid, current_setting('test.fruit_product')::uuid,
  (select id from public.stock_receipts where client_request_id = 'd2000000-0000-4000-8000-000000000003'),
  current_setting('test.fruit_supplier')::uuid, 2500, 2500, 120000, 'kg');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.products where id = current_setting('test.fruit_product')::uuid),
  1::bigint, 'Staff sees own-shop fruit');
select is((select count(*) from public.categories where id = current_setting('test.fruit_category')::uuid),
  1::bigint, 'Staff sees own-shop categories');
select is((select count(*) from public.suppliers where id = current_setting('test.fruit_supplier')::uuid),
  1::bigint, 'Staff sees own-shop suppliers');
select is((select count(*) from public.product_batches where product_id = current_setting('test.fruit_product')::uuid),
  1::bigint, 'Staff sees own-shop batch metadata');
select throws_ok(format($$ select public.save_category(%L::uuid, 'Unauthorized') $$, current_setting('test.fruit_store')),
  'P0001', 'Chỉ chủ cửa hàng được quản lý loại hàng.', 'Staff cannot create categories');
select throws_ok(format($$ select public.save_supplier(%L::uuid, 'Unauthorized') $$, current_setting('test.fruit_store')),
  'P0001', 'Chỉ chủ cửa hàng được quản lý nhà cung cấp.', 'Staff cannot create suppliers');
select throws_ok(format($$ select public.adjust_stock(%L::uuid, %L::uuid, -1, 'spoiled',
  'd2000000-0000-4000-8000-000000000006'::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Chỉ chủ cửa hàng được điều chỉnh tồn kho.', 'Staff cannot adjust stock');
select throws_ok(format($$ select public.save_product(%L::uuid, 'Unauthorized', 'Táo', 'fruit', 'gram',
  '[{"key":"base","name":"gram","factor":1,"can_purchase":false,"can_sell":false}]'::jsonb) $$,
  current_setting('test.fruit_store')),
  'P0001', 'Bạn không có quyền với cửa hàng này.', 'Staff cannot manage products');
select throws_ok(format($$ select public.cancel_sale(%L::uuid,
  (select id from public.sales where client_request_id = 'd2000000-0000-4000-8000-000000000001'),
  'Staff cancel attempt') $$, current_setting('test.fruit_store')),
  'P0001', 'Bạn không có quyền với cửa hàng này.', 'Staff cannot cancel sales');
select ok(not has_column_privilege('authenticated', 'public.stores', 'created_by', 'UPDATE'),
  'Authenticated client cannot rewrite store creator');
select ok(not has_column_privilege('authenticated', 'public.stores', 'business_type', 'UPDATE'),
  'Authenticated client cannot rewrite business type after onboarding');
select ok(not has_table_privilege('authenticated', 'public.product_batches', 'INSERT'),
  'Direct batch writes are denied');

select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.products where id = current_setting('test.fruit_product')::uuid),
  0::bigint, 'Grocery owner cannot read fruit-shop product');
select is((select count(*) from public.categories where id = current_setting('test.fruit_category')::uuid),
  0::bigint, 'Grocery owner cannot read fruit-shop category');
select is((select count(*) from public.suppliers where id = current_setting('test.fruit_supplier')::uuid),
  0::bigint, 'Grocery owner cannot read fruit-shop supplier');
select is((select count(*) from public.product_batches where product_id = current_setting('test.fruit_product')::uuid),
  0::bigint, 'Grocery owner cannot read fruit-shop batches');
select throws_ok(format($$ select public.adjust_stock(%L::uuid, %L::uuid, -1, 'spoiled',
  'd2000000-0000-4000-8000-000000000007'::uuid) $$,
  current_setting('test.fruit_store'), current_setting('test.fruit_product')),
  'P0001', 'Chỉ chủ cửa hàng được điều chỉnh tồn kho.', 'Other shop owner cannot adjust fruit stock');

select * from finish();
rollback;
