begin;
create extension if not exists pgtap with schema extensions;
select plan(31);
select set_config('test.admin_security_baseline',(select count(*) from public.security_events)::text,true);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', 'admin-test@example.invalid', '{"name":"Admin test"}'::jsonb),
  ('f1000000-0000-4000-8000-000000000002', 'user-test@example.invalid', '{"name":"User test"}'::jsonb);
-- First admin bootstrap is a trusted SQL operation, never a public signup.
insert into public.platform_admins (user_id)
  values ('f1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
select ok(not has_function_privilege('authenticated',
  'public.admin_change_store_status(uuid,uuid,text,text,uuid)', 'EXECUTE'),
  'Browser không thể gọi Admin RPC bằng role authenticated');
select ok(not has_function_privilege('authenticated',
  'public.admin_change_admin_status(uuid,uuid,boolean,text,uuid)', 'EXECUTE'),
  'Browser không thể tự cấp quyền Admin');

set local role service_role;
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'dashboard')
  ->> 'active_admins')::bigint, 1::bigint, 'Dashboard đếm Admin thật');
select ok((public.admin_read('f1000000-0000-4000-8000-000000000001', 'shops')
  ->> 'total')::bigint >= 1, 'Danh sách shop đọc qua server RPC');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'shop',
  p_target_id => '00000000-0000-0000-0000-000000000201')
  ->> 'name'), 'Tạp hóa BIN', 'Chi tiết shop chỉ chứa metadata');
select ok((public.admin_read('f1000000-0000-4000-8000-000000000001', 'users')
  ->> 'total')::bigint >= 2, 'Danh sách user có phân trang');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'user',
  p_target_id => 'f1000000-0000-4000-8000-000000000002')
  ->> 'email'), 'user-test@example.invalid', 'Chi tiết user đúng ID');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'admins')
  ->> 'total')::bigint, 1::bigint, 'Danh sách Admin chỉ có Admin đã bootstrap');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'audit')
  ->> 'total')::bigint, 0::bigint, 'Audit chưa phát sinh trả rỗng');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'security')
  ->> 'total')::bigint, current_setting('test.admin_security_baseline')::bigint, 'Security không tạo event giả');
select is((public.admin_read('f1000000-0000-4000-8000-000000000001', 'system')
  ->> 'database_ok')::boolean, true, 'System health đo được DB');
select is((public.admin_change_store_status(
  'f1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000201', 'suspended',
  'Kiểm tra tạm khóa cửa hàng', 'f2000000-0000-4000-8000-000000000001')
  ->> 'status'), 'suspended', 'Admin tạm khóa shop');
select is((public.admin_change_store_status(
  'f1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000201', 'suspended',
  'Kiểm tra tạm khóa cửa hàng', 'f2000000-0000-4000-8000-000000000001')
  ->> 'duplicate')::boolean, true, 'Retry không tạo lần khóa thứ hai');
select throws_ok($$ select public.admin_change_store_status(
  'f1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000201', 'archived',
  'Kiểm tra mã yêu cầu', 'f2000000-0000-4000-8000-000000000001') $$,
  'P0001', 'Mã yêu cầu đã dùng cho thao tác khác.',
  'Không tái dùng request ID với trạng thái khác');
reset role;
select is((select status from public.stores where id = '00000000-0000-0000-0000-000000000201'),
  'suspended', 'Trạng thái shop thực sự thay đổi trong DB');
select is((select count(*) from public.admin_audit_logs
  where request_id = 'f2000000-0000-4000-8000-000000000001'), 1::bigint,
  'Thay đổi shop có đúng một audit record');
select is((select action from public.admin_audit_logs
  where request_id = 'f2000000-0000-4000-8000-000000000001'),
  'SHOP_SUSPENDED', 'Audit ghi đúng hành động');
select is((select count(*) from public.security_events
  where event_type = 'SHOP_SUSPENDED'
    and metadata ->> 'target_id' = '00000000-0000-0000-0000-000000000201'),
  1::bigint, 'Khóa shop tạo security event thật');
select throws_ok($$ update public.admin_audit_logs set reason = 'Giả mạo'
  where request_id = 'f2000000-0000-4000-8000-000000000001' $$,
  '42501', 'Nhật ký quản trị chỉ được ghi thêm.', 'Audit không thể sửa');

set local role service_role;
select is((public.admin_change_store_status(
  'f1000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000201', 'active',
  'Mở lại cửa hàng thử nghiệm', 'f2000000-0000-4000-8000-000000000002')
  ->> 'status'), 'active', 'Admin mở lại shop');
select throws_ok($$ select public.admin_change_admin_status(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001', false,
  'Không được xóa cuối cùng', 'f2000000-0000-4000-8000-000000000003') $$,
  'P0001', 'Không thể vô hiệu quản trị viên cuối cùng.',
  'Bảo vệ Admin hoạt động cuối cùng');
select is((public.admin_change_admin_status(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002', true,
  'Cấp quyền cho người thử nghiệm', 'f2000000-0000-4000-8000-000000000004')
  ->> 'is_active')::boolean, true, 'Cấp quyền Admin cho user có sẵn');
select is((public.admin_change_admin_status(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002', false,
  'Thu hồi quyền thử nghiệm', 'f2000000-0000-4000-8000-000000000005')
  ->> 'is_active')::boolean, false, 'Vô hiệu Admin thứ hai');
select throws_ok($$ select public.admin_change_store_status(
  'f1000000-0000-4000-8000-000000000002',
  '00000000-0000-0000-0000-000000000201', 'suspended',
  'Admin đã bị vô hiệu', 'f2000000-0000-4000-8000-000000000006') $$,
  '42501', 'Tài khoản không có quyền quản trị nền tảng.',
  'Admin bị vô hiệu không thể thao tác');
select is((public.admin_change_user_status(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002', 'disabled',
  'Tạm khóa người dùng thử', 'f2000000-0000-4000-8000-000000000007')
  ->> 'status'), 'disabled', 'Admin vô hiệu tài khoản thường');
reset role;
select is((select account_status from public.profiles
  where id = 'f1000000-0000-4000-8000-000000000002'),
  'disabled', 'Trạng thái tài khoản được lưu DB');
select is((select count(*) from public.security_events
  where event_type = 'USER_DISABLED'
    and user_id = 'f1000000-0000-4000-8000-000000000002'),
  1::bigint, 'Khóa user tạo security event thật');
select is((select count(*) from public.admin_audit_logs
  where target_id = 'f1000000-0000-4000-8000-000000000002'),
  3::bigint, 'Grant, revoke và khóa user đều có audit');
set local role service_role;
select is((public.admin_request_password_reset(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',
  'Đặt lại theo yêu cầu chủ tài khoản',
  'f2000000-0000-4000-8000-000000000008') ->> 'duplicate')::boolean,
  false, 'Yêu cầu reset được audit trước khi gửi email');
select is((public.admin_request_password_reset(
  'f1000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',
  'Đặt lại theo yêu cầu chủ tài khoản',
  'f2000000-0000-4000-8000-000000000008') ->> 'duplicate')::boolean,
  true, 'Retry reset không nhân đôi audit');
reset role;
select ok(not has_table_privilege('authenticated', 'public.admin_audit_logs', 'DELETE'),
  'Browser không thể xóa audit');

select * from finish();
rollback;
