begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_table('public', 'products', 'Có bảng hàng hóa');
select has_table('public', 'sales', 'Có bảng đơn bán');
select has_table('public', 'stock_movements', 'Có sổ biến động kho');
select has_table('public', 'debt_payments', 'Có bảng trả nợ');

-- Run RPCs as the seeded owner.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

select is((select stock_base from public.products where id = '00000000-0000-0000-0000-000000000302'), 72::bigint, 'Tồn nước ban đầu đúng');
select lives_ok($$
  select public.create_sale(
    '00000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001',
    '[{"product_id":"00000000-0000-0000-0000-000000000302","unit_key":"pack","quantity":2}]', 'cash', null
  )
$$, 'Tạo đơn trả ngay');
select is((select stock_base from public.products where id = '00000000-0000-0000-0000-000000000302'), 24::bigint, 'Bán 2 thùng trừ 48 lon');
select is((select total_amount from public.sales where client_request_id = '10000000-0000-0000-0000-000000000001'), 440000::bigint, 'Giá đơn lấy từ DB');

select lives_ok($$
  select public.create_sale(
    '00000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000001',
    '[{"product_id":"00000000-0000-0000-0000-000000000302","unit_key":"pack","quantity":2}]', 'cash', null
  )
$$, 'Gửi lại cùng request không tạo lỗi');
select is((select count(*) from public.sales where client_request_id = '10000000-0000-0000-0000-000000000001'), 1::bigint, 'Mã request chống tạo đơn trùng');
select throws_ok($$
  select public.create_sale(
    '00000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000002',
    '[{"product_id":"00000000-0000-0000-0000-000000000302","unit_key":"pack","quantity":2}]', 'cash', null
  )
$$, 'P0001', 'Không đủ hàng Nước lon mẫu trong kho.', 'Không bán vượt tồn');

select lives_ok($$
  select public.create_sale(
    '00000000-0000-0000-0000-000000000201', '10000000-0000-0000-0000-000000000003',
    '[{"product_id":"00000000-0000-0000-0000-000000000301","unit_key":"base","quantity":4}]',
    'credit', '00000000-0000-0000-0000-000000000401'
  )
$$, 'Tạo đơn mua chịu');
select is((select current_debt from public.customers where id = '00000000-0000-0000-0000-000000000401'), 18000::bigint, 'Mua chịu tăng nợ');
select ok((select is_in_debt_book from public.customers where id = '00000000-0000-0000-0000-000000000401'), 'Khách xuất hiện trong sổ nợ');

select lives_ok($$
  select public.record_debt_payment(
    '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000401', 7000,
    '10000000-0000-0000-0000-000000000004', 'cash', 'Trả một phần'
  )
$$, 'Nhận tiền trả một phần');
select is((select current_debt from public.customers where id = '00000000-0000-0000-0000-000000000401'), 11000::bigint, 'Trả một phần giữ số nợ còn lại');
select is((select outstanding_amount from public.sales where client_request_id = '10000000-0000-0000-0000-000000000003'), 11000::bigint, 'Khoản trả được phân bổ vào đơn');

select lives_ok(format($$
  select public.cancel_sale(
    '00000000-0000-0000-0000-000000000201', %L, 'Khách trả lại toàn bộ đơn'
  )
$$, (select id from public.sales where client_request_id = '10000000-0000-0000-0000-000000000003')), 'Hủy đơn mua chịu');
select is((select current_debt from public.customers where id = '00000000-0000-0000-0000-000000000401'), 0::bigint, 'Hủy đơn xóa phần nợ còn lại');
select isnt((select is_in_debt_book from public.customers where id = '00000000-0000-0000-0000-000000000401'), true, 'Khách hết nợ rời sổ nợ');
select results_eq(
  $$ select refund_amount, debt_reduction from public.sales where client_request_id = '10000000-0000-0000-0000-000000000003' $$,
  $$ values (7000::bigint, 11000::bigint) $$,
  'Hủy đơn hoàn phần đã trả và giảm phần còn nợ'
);

select throws_ok(
  $$ update public.products set stock_base = 999 where id = '00000000-0000-0000-0000-000000000301' $$,
  '42501', 'permission denied for table products', 'Frontend không thể sửa thẳng tồn kho'
);
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select is((select count(*) from public.products), 0::bigint, 'RLS không cho người ngoài xem hàng của cửa hàng');

select * from finish();
rollback;
