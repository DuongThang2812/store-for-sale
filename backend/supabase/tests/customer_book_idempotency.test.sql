begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users (id, email, raw_user_meta_data)
values ('f9000000-0000-4000-8000-000000000001', 'customer-owner@example.invalid', '{}'::jsonb);
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f9000000-0000-4000-8000-000000000001', true);
select set_config('test.customer_store', public.create_store('Customer book test')::text, true);
select set_config('test.customer_id', (public.create_customer(current_setting('test.customer_store')::uuid,
  'f9000000-0000-4000-8000-000000000101'::uuid, 'Cô Lan') ->> 'customer_id'), true);
select is((select count(*) from public.customer_debt_summary
  where store_id = current_setting('test.customer_store')::uuid and is_in_debt_book),
  1::bigint, 'New zero-debt customer remains selectable in debt book');
select ok((public.create_customer(current_setting('test.customer_store')::uuid,
  'f9000000-0000-4000-8000-000000000101'::uuid, 'Cô Lan') ->> 'duplicate')::boolean,
  'Retry of add-customer returns same row');
select throws_ok(format($$select public.create_customer(%L::uuid,
  'f9000000-0000-4000-8000-000000000101'::uuid, 'Người khác')$$,
  current_setting('test.customer_store')), 'P0001', 'Mã yêu cầu đã dùng cho khách khác.',
  'Reused request ID with different customer is rejected');
select set_config('test.customer_product', public.save_product(current_setting('test.customer_store')::uuid,
  'Coca', 'Nước', 'other', 'lon',
  '[{"key":"base","name":"lon","factor":1,"purchase_price":null,"sale_price":10000,"can_purchase":false,"can_sell":true}]'::jsonb,
  2)::text, true);
select lives_ok(format($$select public.create_sale(%L::uuid,
  'f9000000-0000-4000-8000-000000000102'::uuid,
  '[{"product_id":"%s","unit_key":"base","quantity":1}]'::jsonb,
  'credit', %L::uuid)$$, current_setting('test.customer_store'),
  current_setting('test.customer_product'), current_setting('test.customer_id')),
  'Credit sale keeps customer in book');
select is((public.record_debt_payment(current_setting('test.customer_store')::uuid,
  current_setting('test.customer_id')::uuid, 10000,
  'f9000000-0000-4000-8000-000000000103'::uuid) ->> 'remaining_debt')::bigint,
  0::bigint, 'Full repayment clears debt');
select is((select count(*) from public.customer_debt_summary
  where store_id = current_setting('test.customer_store')::uuid and is_in_debt_book),
  0::bigint, 'Fully paid customer leaves debt book while history remains');
select * from finish();
rollback;
