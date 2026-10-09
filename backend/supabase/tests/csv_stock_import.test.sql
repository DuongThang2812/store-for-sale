begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id, email, raw_user_meta_data)
values ('fa000000-0000-4000-8000-000000000001', 'csv-owner@example.invalid', '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000001', true);
select set_config('test.csv_store', public.create_store('CSV import test')::text, true);
select set_config('test.csv_existing', public.save_product(current_setting('test.csv_store')::uuid,
  'Coca', 'Nước', 'other', 'lon',
  '[{"key":"base","name":"lon","factor":1,"purchase_price":1000,"sale_price":2000,"can_purchase":true,"can_sell":true}]'::jsonb,
  0)::text, true);

select lives_ok(format($$select public.import_stock_csv(%L::uuid,
  'fa000000-0000-4000-8000-000000000101'::uuid,
  '[{"existing_product_id":"%s","unit_key":"base","quantity":3,"unit_cost":1000},{"product":{"name":"Sữa mới","category":"Sữa","product_group":"other","base_unit":"hộp","low_stock_threshold":5,"units":[{"key":"base","name":"hộp","factor":1,"purchase_price":3000,"sale_price":5000,"can_purchase":true,"can_sell":true}]},"unit_key":"base","quantity":2,"unit_cost":3000}]'::jsonb)$$,
  current_setting('test.csv_store'), current_setting('test.csv_existing')),
  'One CSV import creates product and receipt atomically');
select is((select stock_base from public.products where id = current_setting('test.csv_existing')::uuid),
  3::bigint, 'Existing product stock increased');
select is((select stock_base from public.products where store_id = current_setting('test.csv_store')::uuid and name = 'Sữa mới'),
  2::bigint, 'New product stock increased');
select is((select count(*) from public.stock_receipts where store_id = current_setting('test.csv_store')::uuid),
  1::bigint, 'One receipt contains both lines');
select ok((public.import_stock_csv(current_setting('test.csv_store')::uuid,
  'fa000000-0000-4000-8000-000000000101'::uuid,
  jsonb_build_array(
    jsonb_build_object('existing_product_id', current_setting('test.csv_existing'), 'unit_key', 'base', 'quantity', 3, 'unit_cost', 1000),
    jsonb_build_object('product', jsonb_build_object('name','Sữa mới','category','Sữa','product_group','other','base_unit','hộp','low_stock_threshold',5,
      'units','[{"key":"base","name":"hộp","factor":1,"purchase_price":3000,"sale_price":5000,"can_purchase":true,"can_sell":true}]'::jsonb),
      'unit_key','base','quantity',2,'unit_cost',3000))) ->> 'duplicate')::boolean,
  'Retry with identical payload is idempotent');
select throws_ok(format($$select public.import_stock_csv(%L::uuid,
  'fa000000-0000-4000-8000-000000000101'::uuid,
  '[{"existing_product_id":"%s","unit_key":"base","quantity":4,"unit_cost":1000}]'::jsonb)$$,
  current_setting('test.csv_store'), current_setting('test.csv_existing')),
  'P0001', 'Mã yêu cầu đã dùng cho file CSV khác.',
  'Request ID cannot be reused for changed file');
select throws_ok(format($$select public.import_stock_csv(%L::uuid,
  'fa000000-0000-4000-8000-000000000102'::uuid,
  '[{"product":{"name":"Hàng sẽ rollback","category":"Khác","product_group":"other","base_unit":"cái","low_stock_threshold":5,"units":[{"key":"base","name":"cái","factor":1,"purchase_price":100,"sale_price":200,"can_purchase":true,"can_sell":true}]},"unit_key":"base","quantity":1,"unit_cost":100},{"existing_product_id":"fa000000-0000-4000-8000-000000009999","unit_key":"base","quantity":1,"unit_cost":100}]'::jsonb)$$,
  current_setting('test.csv_store')), 'P0001', 'Mặt hàng CSV không còn trong kho đang bán.',
  'A bad later row rejects the whole file');
select is((select count(*) from public.products where store_id = current_setting('test.csv_store')::uuid and name = 'Hàng sẽ rollback'),
  0::bigint, 'Rejected CSV leaves no partial new product');
select * from finish();
rollback;
