begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Two real Auth identities and stores. Rollback keeps the seed untouched.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'shop-a-test@example.invalid', '{"name":"Owner A"}'::jsonb),
  ('b1000000-0000-4000-8000-000000000001', 'shop-b-test@example.invalid', '{"name":"Owner B"}'::jsonb),
  ('c1000000-0000-4000-8000-000000000001', 'staff-a-test@example.invalid', '{"name":"Staff A"}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('test.shop_a', public.create_store('RLS Shop A')::text, true);
select set_config('test.product_a', public.save_product(
  current_setting('test.shop_a')::uuid, 'RLS Product A', 'Test', 'other', 'cái',
  '[{"key":"base","name":"cái","factor":1,"sale_price":1000,"can_sell":true}]'::jsonb
)::text, true);
select set_config('test.customer_a', public.save_customer(current_setting('test.shop_a')::uuid, 'RLS Customer A')::text, true);
select is((select count(*) from public.stores where id = current_setting('test.shop_a')::uuid), 1::bigint, 'Owner A reads Shop A');
select is((select count(*) from public.products where id = current_setting('test.product_a')::uuid), 1::bigint, 'Owner A reads own product');
select is((select count(*) from public.customers where id = current_setting('test.customer_a')::uuid), 1::bigint, 'Owner A reads own customer');

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);
select set_config('test.shop_b', public.create_store('RLS Shop B')::text, true);
select set_config('test.product_b', public.save_product(
  current_setting('test.shop_b')::uuid, 'RLS Product B', 'Test', 'other', 'cái',
  '[{"key":"base","name":"cái","factor":1,"sale_price":2000,"can_sell":true}]'::jsonb
)::text, true);
select is((select count(*) from public.products where id = current_setting('test.product_a')::uuid), 0::bigint, 'Owner B cannot read Shop A product by ID');
select is((select count(*) from public.customers where id = current_setting('test.customer_a')::uuid), 0::bigint, 'Owner B cannot read Shop A customer by ID');
select is((select count(*) from public.stores where id = current_setting('test.shop_a')::uuid), 0::bigint, 'Owner B cannot read Shop A');
select throws_ok(format($$ select public.save_product(%L::uuid, 'Attack', 'Test', 'other', 'cái', '[{"key":"base","name":"cái","factor":1,"sale_price":1000,"can_sell":true}]'::jsonb, 0, 5, true, %L::uuid) $$,
  current_setting('test.shop_a'), current_setting('test.product_a')),
  'P0001', 'Bạn không có quyền với cửa hàng này.', 'Owner B cannot update Shop A product through RPC');
select throws_ok($$ update public.products set stock_base = 999 where id = current_setting('test.product_a')::uuid $$,
  '42501', 'permission denied for table products', 'Direct product mutation is blocked');
select throws_ok($$ delete from public.customers where id = current_setting('test.customer_a')::uuid $$,
  '42501', 'permission denied for table customers', 'Direct customer deletion is blocked');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.products where id = current_setting('test.product_b')::uuid), 0::bigint,
  'Owner A cannot query Shop B product by ID');
select throws_ok(format($$ select public.save_product(%L::uuid, 'Attack', 'Test', 'other', 'cái', '[{"key":"base","name":"cái","factor":1,"sale_price":1000,"can_sell":true}]'::jsonb, 0, 5, true, %L::uuid) $$,
  current_setting('test.shop_b'), current_setting('test.product_b')),
  'P0001', 'Bạn không có quyền với cửa hàng này.', 'Owner A cannot update Shop B product through RPC');

reset role;
insert into public.store_members (store_id, user_id, role)
values (current_setting('test.shop_a')::uuid, 'c1000000-0000-4000-8000-000000000001', 'staff');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.products where id = current_setting('test.product_a')::uuid), 1::bigint, 'Staff A can read own shop');
select is((select count(*) from public.products where id = current_setting('test.product_b')::uuid), 0::bigint, 'Staff A cannot read Shop B');
select throws_ok(format($$ select public.import_catalog_drafts(%L::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, '[{"source_id":"STAFF-TEST","name":"Staff item","category":"Test","product_group":"other","base_unit":"cái"}]'::jsonb) $$,
  current_setting('test.shop_a')),
  'P0001', 'Chỉ chủ cửa hàng được nhập danh mục vào DB.', 'Staff cannot use owner-only catalog import');
select throws_ok(format($$ update public.stores set name = 'Hijacked' where id = %L::uuid $$, current_setting('test.shop_a')),
  '42501', 'permission denied for table stores', 'Direct shop settings writes require the owner RPC');
select is((select name from public.stores where id = current_setting('test.shop_a')::uuid), 'RLS Shop A',
  'Staff cannot rename the shop');
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('stores','store_members','products','customers','sales','stock_receipts','debt_payments') and c.relrowsecurity), 7::bigint,
  'RLS is enabled on key shop tables');

select * from finish();
rollback;
