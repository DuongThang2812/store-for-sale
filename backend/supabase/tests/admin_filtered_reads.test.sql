begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select set_config('test.filtered_security_baseline',(select count(*) from public.security_events
 where created_at>='2026-10-04T17:00:00Z' and created_at<'2026-10-05T17:00:00Z')::text,true);
insert into auth.users(id,email,raw_user_meta_data,created_at) values
 ('fe000000-0000-4000-8000-000000000001','read-owner-a@example.invalid','{"name":"Alpha"}','2026-10-01Z'),
 ('fe000000-0000-4000-8000-000000000002','read-owner-b@example.invalid','{"name":"Beta"}','2026-10-02Z'),
 ('fe000000-0000-4000-8000-000000000003','read-staff@example.invalid','{"name":"Gamma"}','2026-10-03Z');
insert into public.platform_admins(user_id) values
 ('fe000000-0000-4000-8000-000000000001'),('fe000000-0000-4000-8000-000000000002');
insert into public.stores(id,name,created_by,business_type,status,created_at) values
 ('fe000000-0000-4000-8000-000000000101','Filter validation Alpha','fe000000-0000-4000-8000-000000000001','grocery','active','2026-10-01Z'),
 ('fe000000-0000-4000-8000-000000000102','Filter validation Beta','fe000000-0000-4000-8000-000000000002','fruit_shop','suspended','2026-10-02Z'),
 ('fe000000-0000-4000-8000-000000000103','Filter validation Gamma','fe000000-0000-4000-8000-000000000001','fruit_shop','active','2026-10-03Z');
insert into public.store_members(store_id,user_id,role) values
 ('fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000001','owner'),
 ('fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000003','staff');
insert into public.admin_audit_logs(admin_user_id,action,target_type,target_id,reason,request_id,created_at) values
 ('fe000000-0000-4000-8000-000000000001','SHOP_SUSPENDED','store','fe000000-0000-4000-8000-000000000102','Read boundary fixture','fe000000-0000-4000-8000-000000000201','2026-10-04T17:00:00Z'),
 ('fe000000-0000-4000-8000-000000000002','SHOP_RESTORED','store','fe000000-0000-4000-8000-000000000103','Read boundary fixture','fe000000-0000-4000-8000-000000000202','2026-10-05T16:59:59.999Z'),
 ('fe000000-0000-4000-8000-000000000001','USER_DISABLED','user','fe000000-0000-4000-8000-000000000003','Read boundary fixture','fe000000-0000-4000-8000-000000000203','2026-10-05T17:00:00Z');
-- Generated event timestamps default to now(); align test fixtures only through
-- trusted SQL so the read boundary test has controlled timestamps.
update public.security_events e set created_at=a.created_at from public.admin_audit_logs a where e.metadata->>'audit_id'=a.id::text
 and a.admin_user_id in ('fe000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000002');

set local role service_role;
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation',p_filter=>'active',p_business_type=>'fruit_shop')->>'total')::bigint,
 1::bigint,'Shop status and business type filters combine on server');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation',p_sort=>'name_asc',p_limit=>1)->'items'->0->>'name',
 'Filter validation Alpha','Name ordering is applied before pagination');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation',p_sort=>'name_asc',p_limit=>1,p_offset=>1)->'items'->0->>'name',
 'Filter validation Beta','Second page does not repeat the first name');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation',p_sort=>'created_desc',p_limit=>1)->'items'->0->>'name',
 'Filter validation Gamma','Newest shop ordering is server-side');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'read-owner-b@example.invalid')->>'total')::bigint,
 1::bigint,'Shop search includes owner email');
select ok(not (public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation')->'items'->0 ? '_order'),
 'Internal pagination rank is not exposed');
select is(jsonb_array_length(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_query=>'Filter validation',p_offset=>20)->'items'),0,
 'Offset beyond the result returns a bounded empty page');
select ok(not (public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops')->'items'->0 ?| array['customers','sales','debt','revenue']),
 'Platform metadata does not expose shop business details');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','users',p_query=>'read-',p_sort=>'name_desc')->'items'->0->>'display_name',
 'Gamma','User names can be sorted descending on server');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','users',p_query=>'read-',p_filter=>'staff')->>'total')::bigint,
 1::bigint,'User role filter requires active membership');
select ok(not (public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','users',p_query=>'read-')->'items'->0 ?| array['encrypted_password','raw_user_meta_data']),
 'User metadata excludes Auth secrets');
select is(jsonb_array_length(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','admins',p_limit=>1)->'items'),1,
 'Admin roster is paginated');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','audit',p_from=>'2026-10-04T17:00:00Z',p_to=>'2026-10-05T17:00:00Z')->>'total')::bigint,
 2::bigint,'Vietnam day includes midnight and excludes next midnight');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','audit',p_admin_id=>'fe000000-0000-4000-8000-000000000001',p_filter=>'store')->>'total')::bigint,
 1::bigint,'Audit actor and target type filters combine');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','audit',p_action=>'SHOP_RESTORED')->'items'->0->>'admin_name',
 'Beta','Audit includes actor name and exact action filter');
select is(public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','audit',p_sort=>'created_asc',p_limit=>1)->'items'->0->>'action',
 'SHOP_SUSPENDED','Oldest audit is sorted before limiting');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','security',p_from=>'2026-10-04T17:00:00Z',p_to=>'2026-10-05T17:00:00Z')->>'total')::bigint,
 current_setting('test.filtered_security_baseline')::bigint+2,'Security event date range uses the same exclusive boundary');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','security',p_event_user_id=>'fe000000-0000-4000-8000-000000000003')->>'total')::bigint,
 1::bigint,'Security can filter observed events by user');
select throws_ok($q$select public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_sort=>'name; drop table stores')$q$,
 '22023',null,'Arbitrary SQL order is rejected');
select throws_ok($q$select public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','security',p_sort=>'name_asc')$q$,
 '22023',null,'Unsupported resource sort is rejected');
select throws_ok($q$select public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops',p_business_type=>'staff')$q$,
 '22023',null,'Invalid business type is rejected');
select throws_ok($q$select public.admin_read_filtered('fe000000-0000-4000-8000-000000000003','audit')$q$,
 '42501',null,'Service RPC still requires an active platform admin actor');
select is((public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','system')->>'database_ok')::boolean,true,
 'Non-list reads retain measured system status');
set local role authenticated;
select throws_ok($q$select public.admin_read_filtered('fe000000-0000-4000-8000-000000000001','shops')$q$,
 '42501',null,'Browser cannot bypass the verified Admin Edge API');
select * from finish();
rollback;
