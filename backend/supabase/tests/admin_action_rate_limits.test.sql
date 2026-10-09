begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('fa000000-0000-4000-8000-000000000001','rate-admin-a@example.invalid','{}'),
 ('fa000000-0000-4000-8000-000000000002','rate-admin-b@example.invalid','{}'),
 ('fa000000-0000-4000-8000-000000000003','rate-admin-c@example.invalid','{}'),
 ('fa000000-0000-4000-8000-000000000004','rate-admin-d@example.invalid','{}'),
 ('fa000000-0000-4000-8000-000000000005','rate-disabled@example.invalid','{}'),
 ('fa000000-0000-4000-8000-000000000006','rate-ordinary@example.invalid','{}');
insert into public.platform_admins(user_id,is_active)
 select id,id<>'fa000000-0000-4000-8000-000000000005'::uuid from auth.users
 where email like 'rate-%' and email<>'rate-ordinary@example.invalid';
create function pg_temp.admit(p_actor integer,p_num integer,p_action text default 'user_status',p_reason text default 'Rate fixture')
returns jsonb language sql as $$
 select public.admin_admit_action(
   ('fa000000-0000-4000-8000-'||lpad(p_actor::text,12,'0'))::uuid,
   ('fa000000-0000-4000-9000-'||lpad(p_num::text,12,'0'))::uuid,
   p_action,'fa000000-0000-4000-8000-000000000006',p_reason,
   case when p_action='user_status' then 'disabled' when p_action='store_status' then 'suspended' end,
   case when p_action='admin_status' then true end);
$$;
set local role anon;
select throws_ok('select pg_temp.admit(1,1)','42501',null,'Anonymous cannot invoke Admin admission');
set local role authenticated;
select throws_ok('select pg_temp.admit(1,1)','42501',null,'Browser JWT cannot invoke Admin admission');
select throws_ok('select * from public.admin_action_admissions','42501',null,'Browser cannot read intent hashes');
select throws_ok('select * from public.admin_action_rate_windows','42501',null,'Browser cannot read rate counters');
set local role service_role;
select throws_ok('select pg_temp.admit(6,1)','42501',null,'Service call must still name an active Admin actor');
select throws_ok('select pg_temp.admit(5,1)','42501',null,'Disabled Admin cannot be admitted');
select throws_ok($q$select public.admin_admit_action('fa000000-0000-4000-8000-000000000001',
 'fa000000-0000-4000-9000-000000000001',null,'fa000000-0000-4000-8000-000000000006','Rate fixture')$q$,
 '22023',null,'Null action is rejected');
select throws_ok($q$select public.admin_admit_action('fa000000-0000-4000-8000-000000000001',
 'fa000000-0000-4000-9000-000000000001','user_status','fa000000-0000-4000-8000-000000000006','Rate fixture','deleted')$q$,
 '22023',null,'Invalid target status is rejected');
select is((select count(*) from generate_series(1,10) n where (pg_temp.admit(1,n)->>'allowed')::boolean),
 10::bigint,'Ten new intents can be admitted in a rolling minute');
select is((pg_temp.admit(1,11)->>'allowed')::boolean,false,'Eleventh new intent is denied');
select ok((pg_temp.admit(1,12)->>'retry_after')::integer between 1 and 60,'Denial includes bounded retry delay');
select is((pg_temp.admit(1,1)->>'duplicate')::boolean,true,'Same intent retry does not consume another intent slot');
select throws_ok($q$select pg_temp.admit(1,1,'user_status','Changed reason')$q$,'22023',null,'Request ID cannot be reused with a changed reason');
select throws_ok($q$select pg_temp.admit(1,1,'password_reset')$q$,'22023',null,'Request ID cannot be reused for another action');
select is((pg_temp.admit(2,1)->>'allowed')::boolean,true,'Other Admin has an independent quota');
select is((select count(*) from generate_series(1,3) n where (pg_temp.admit(3,n,'admin_status')->>'allowed')::boolean),
 3::bigint,'Three Admin permission changes can be admitted');
select is((pg_temp.admit(3,4,'admin_status')->>'allowed')::boolean,false,'Fourth Admin permission change is denied');
select is((pg_temp.admit(3,1,'admin_status')->>'duplicate')::boolean,true,'Permission change retry preserves the request ID');
select is((pg_temp.admit(3,5,'password_reset')->>'allowed')::boolean,true,'Stricter Admin quota does not consume other action slots');
select is((select count(*) from generate_series(1,30) n where (pg_temp.admit(4,1)->>'allowed')::boolean),
 30::bigint,'Retries share a thirty-attempt bound');
select is((pg_temp.admit(4,1)->>'allowed')::boolean,false,'Thirty-first retry is denied before external Auth calls');
select throws_ok('select * from public.admin_action_rate_windows','42501',null,'Service role cannot edit counters directly via Data API');
reset role;
select is((select count(*) from public.admin_action_admissions where actor_id='fa000000-0000-4000-8000-000000000001'),
 10::bigint,'Denied requests do not create admitted intents');
select is((select count(*) from public.admin_action_admissions where actor_id='fa000000-0000-4000-8000-000000000004'),
 1::bigint,'Thirty retries persist a single intent hash');
select is((select count(*) from public.security_events where user_id='fa000000-0000-4000-8000-000000000001' and event_type='ADMIN_RATE_LIMITED'),
 1::bigint,'Repeated denials record one observed security event per minute');
select ok(not exists(select 1 from public.security_events where event_type='ADMIN_RATE_LIMITED' and metadata ? 'reason'),
 'Limiter events do not persist plaintext human reasons');
select is((select count(*) from public.admin_audit_logs where admin_user_id::text like 'fa000000-%'),
 0::bigint,'Admission does not claim a business operation was completed');
update public.admin_action_admissions set created_at=clock_timestamp()-interval '61 seconds'
 where actor_id='fa000000-0000-4000-8000-000000000001';
update public.admin_action_rate_windows set attempt_times=array[clock_timestamp()-interval '61 seconds']
 where actor_id in ('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000004');
set local role service_role;
select is((pg_temp.admit(1,11)->>'allowed')::boolean,true,'New intent is allowed after rolling window expires');
select is((pg_temp.admit(4,1)->>'duplicate')::boolean,true,'Attempt window expiry allows safe retry with the same ID');
select throws_ok($q$select pg_temp.admit(1,1,'user_status','Changed reason')$q$,'22023',null,
 'Intent hash remains bound to the request even after the rate window expires');
select * from finish();
rollback;
