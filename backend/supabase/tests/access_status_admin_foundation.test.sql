begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'platform_admins', 'Platform Admin có bảng riêng');
select has_table('public', 'admin_audit_logs', 'Có nhật ký Admin');
select has_table('public', 'security_events', 'Có nhật ký sự kiện bảo mật');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'account_status', 'UPDATE'),
  'Người dùng không thể tự bật lại tài khoản');
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'SELECT'),
  'Shop user không được đọc danh sách Admin');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'INSERT'),
  'Shop user không thể ghi log Admin');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select ok(public.is_store_member('00000000-0000-0000-0000-000000000201'),
  'Thành viên đang hoạt động có quyền đọc cửa hàng');
select is((select count(*) from public.products
  where store_id = '00000000-0000-0000-0000-000000000201'), 6::bigint,
  'Chủ tiệm đọc được hàng hiện có');

reset role;
update public.stores set status = 'suspended'
  where id = '00000000-0000-0000-0000-000000000201';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select is((select count(*) from public.products
  where store_id = '00000000-0000-0000-0000-000000000201'), 6::bigint,
  'Cửa hàng tạm khóa vẫn cho chủ tiệm đọc dữ liệu');
select throws_ok($$ select public.save_customer(
    '00000000-0000-0000-0000-000000000201', 'Không được thêm') $$,
  '42501', 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.',
  'RPC thêm khách không được ghi khi tạm khóa');
select throws_ok($$ select public.create_sale(
    '00000000-0000-0000-0000-000000000201',
    'd5000000-0000-4000-8000-000000000001',
    '[{"product_id":"00000000-0000-0000-0000-000000000301","unit_key":"base","quantity":1}]'::jsonb,
    'cash', null) $$,
  '42501', 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.',
  'RPC bán hàng không được ghi khi tạm khóa');
select throws_ok($$ select public.receive_stock(
    '00000000-0000-0000-0000-000000000201',
    'd5000000-0000-4000-8000-000000000002',
    '[{"product_id":"00000000-0000-0000-0000-000000000301","unit_key":"base","quantity":1,"unit_cost":1000}]'::jsonb,
    null) $$,
  '42501', 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.',
  'RPC nhập kho không được ghi khi tạm khóa');
select throws_ok($$ select public.record_inventory_count(
    '00000000-0000-0000-0000-000000000201',
    'd5000000-0000-4000-8000-000000000003',
    '[{"product_id":"00000000-0000-0000-0000-000000000301","actual_base":99,"reason":"Kiểm tra"}]'::jsonb,
    null) $$,
  '42501', 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.',
  'RPC kiểm kê không được ghi khi tạm khóa');
select is((select stock_base from public.products
  where id = '00000000-0000-0000-0000-000000000301'), 100::bigint,
  'Các lệnh bị chặn không đổi tồn kho');

reset role;
update public.stores set status = 'active'
  where id = '00000000-0000-0000-0000-000000000201';
update public.store_members set is_active = false
  where store_id = '00000000-0000-0000-0000-000000000201'
    and user_id = '00000000-0000-0000-0000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select ok(not public.is_store_member('00000000-0000-0000-0000-000000000201'),
  'Thành viên vô hiệu không còn quyền');
select is((select count(*) from public.products
  where store_id = '00000000-0000-0000-0000-000000000201'), 0::bigint,
  'RLS ẩn dữ liệu với thành viên vô hiệu');

reset role;
update public.store_members set is_active = true
  where store_id = '00000000-0000-0000-0000-000000000201'
    and user_id = '00000000-0000-0000-0000-000000000101';
update public.profiles set account_status = 'disabled'
  where id = '00000000-0000-0000-0000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select ok(not public.is_store_owner('00000000-0000-0000-0000-000000000201'),
  'Tài khoản vô hiệu không còn quyền chủ tiệm');
select throws_ok($$ select public.create_store('Cửa hàng không hợp lệ') $$,
  '42501', 'Tài khoản không được tạo cửa hàng.',
  'Tài khoản vô hiệu không thể tạo cửa hàng mới');

select * from finish();
rollback;
