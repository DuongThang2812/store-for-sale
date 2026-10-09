begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data)
values ('f8000000-0000-4000-8000-000000000001', 'legacy-owner@example.invalid', '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f8000000-0000-4000-8000-000000000001', true);
select set_config('test.legacy_store', public.create_store('Legacy import test')::text, true);
select public.save_product(current_setting('test.legacy_store')::uuid,
  'Coca cũ', 'Nước', 'other', 'lon',
  '[{"key":"base","name":"lon","factor":1,"purchase_price":null,"sale_price":0,"can_purchase":false,"can_sell":true}]'::jsonb,
  0, 5, false);

select lives_ok(format($$select public.import_legacy_snapshot(%L::uuid,
  'f8000000-0000-4000-8000-000000000101'::uuid, repeat('a',64), 0,
  '[{"legacy_id":"old-coca","name":"Coca cũ","category":"Nước","product_group":"other","base_unit":"lon","stock_base":10,"low_stock_threshold":5,"is_active":true,"units":[{"key":"base","name":"lon","factor":1,"purchase_price":null,"sale_price":10000,"can_purchase":false,"can_sell":true}]},{"legacy_id":"old-milk","name":"Sữa cũ","category":"Sữa","product_group":"other","base_unit":"hộp","stock_base":2,"low_stock_threshold":5,"is_active":true,"units":[{"key":"base","name":"hộp","factor":1,"purchase_price":null,"sale_price":8000,"can_purchase":false,"can_sell":true}]}]'::jsonb,
  '[{"legacy_id":"old-customer","name":"Cô Lan","phone":"","note":"","current_debt":5000}]'::jsonb,
  '[{"legacy_id":"old-entry-1","kind":"debt","customer_legacy_id":"old-customer","date":"2026-01-01T10:00:00.000Z","source_entry":{"id":"old-entry-1","title":"Nợ cũ","amount":5000}},{"legacy_id":"old-entry-2","kind":"stock","date":"2026-01-02T10:00:00.000Z","source_entry":{"id":"old-entry-2","title":"Nhập cũ","amount":0}}]'::jsonb)$$,
  current_setting('test.legacy_store')), 'Snapshot import is atomic');

select is((select count(*) from public.legacy_product_links
  where store_id = current_setting('test.legacy_store')::uuid), 2::bigint,
  'Both old product IDs are linked');
select is((select sum(p.stock_base) from public.products p
  where store_id = current_setting('test.legacy_store')::uuid), 12::numeric,
  'Only current stock snapshot is opened, not historical movements replayed');
select is((select count(*) from public.products
  where store_id = current_setting('test.legacy_store')::uuid and lower(name) = 'coca cũ'), 1::bigint,
  'Inactive catalog draft is reused without duplicate product');
select is((select count(*) from public.legacy_history_entries
  where store_id = current_setting('test.legacy_store')::uuid), 2::bigint,
  'Original history is archived verbatim');
select is((select current_debt from public.customers
  where store_id = current_setting('test.legacy_store')::uuid), 5000::bigint,
  'Opening receivable matches old customer balance');
select is((public.management_report(current_setting('test.legacy_store')::uuid, 1)
  -> 'totals' ->> 'revenue')::bigint, 0::bigint,
  'Opening receivable is not new sale revenue');
select ok((public.import_legacy_snapshot(current_setting('test.legacy_store')::uuid,
  'f8000000-0000-4000-8000-000000000101'::uuid, repeat('a',64), 0,
  '[{"legacy_id":"old-coca","name":"Coca cũ","category":"Nước","product_group":"other","base_unit":"lon","stock_base":10,"low_stock_threshold":5,"is_active":true,"units":[{"key":"base","name":"lon","factor":1,"purchase_price":null,"sale_price":10000,"can_purchase":false,"can_sell":true}]},{"legacy_id":"old-milk","name":"Sữa cũ","category":"Sữa","product_group":"other","base_unit":"hộp","stock_base":2,"low_stock_threshold":5,"is_active":true,"units":[{"key":"base","name":"hộp","factor":1,"purchase_price":null,"sale_price":8000,"can_purchase":false,"can_sell":true}]}]'::jsonb,
  '[{"legacy_id":"old-customer","name":"Cô Lan","phone":"","note":"","current_debt":5000}]'::jsonb,
  '[{"legacy_id":"old-entry-1","kind":"debt","customer_legacy_id":"old-customer","date":"2026-01-01T10:00:00.000Z","source_entry":{"id":"old-entry-1","title":"Nợ cũ","amount":5000}},{"legacy_id":"old-entry-2","kind":"stock","date":"2026-01-02T10:00:00.000Z","source_entry":{"id":"old-entry-2","title":"Nhập cũ","amount":0}}]'::jsonb) ->> 'duplicate')::boolean,
  'Retry with the exact snapshot is idempotent');
select throws_ok(format($$select public.import_legacy_snapshot(%L::uuid,
  'f8000000-0000-4000-8000-000000000101'::uuid, repeat('a',64), 0,
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)$$, current_setting('test.legacy_store')),
  'P0001', 'Cửa hàng đã chuyển một bản dữ liệu khác; không nhập lại.',
  'Same request ID with changed payload is rejected');
select is((public.record_debt_payment(current_setting('test.legacy_store')::uuid,
  (select customer_id from public.legacy_customer_links where legacy_id = 'old-customer'),
  5000, 'f8000000-0000-4000-8000-000000000102'::uuid) ->> 'remaining_debt')::bigint,
  0::bigint, 'Existing payment RPC clears imported opening receivable');
select is((select outstanding_amount from public.sales
  where store_id = current_setting('test.legacy_store')::uuid and is_legacy_opening),
  0::bigint, 'Synthetic receivable is fully allocated');
select throws_ok(format($$select public.cancel_sale(%L::uuid,
  (select id from public.sales where store_id = %L::uuid and is_legacy_opening), 'Sai nợ')$$,
  current_setting('test.legacy_store'), current_setting('test.legacy_store')),
  'P0001', 'Đơn không có chi tiết mặt hàng để hoàn kho.',
  'Synthetic opening receivable cannot fabricate stock on cancellation');

select * from finish();
rollback;
