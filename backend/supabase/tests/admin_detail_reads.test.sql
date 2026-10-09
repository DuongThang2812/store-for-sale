begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data) values
 ('f9000000-0000-4000-8000-000000000001','detail-admin@example.invalid','{"name":"Detail Admin"}'),
 ('f9000000-0000-4000-8000-000000000002','detail-staff@example.invalid','{"name":"Detail Staff"}'),
 ('f9000000-0000-4000-8000-000000000003','detail-inactive@example.invalid','{"name":"Inactive Staff"}');
insert into public.platform_admins(user_id) values('f9000000-0000-4000-8000-000000000001');
insert into public.stores(id,name,created_by,business_type,status) values
 ('f9000000-0000-4000-8000-000000000101','Detail store A','f9000000-0000-4000-8000-000000000001','grocery','active'),
 ('f9000000-0000-4000-8000-000000000102','Detail store B','f9000000-0000-4000-8000-000000000001','fruit_shop','suspended');
insert into public.store_members(store_id,user_id,role,is_active,created_at) values
 ('f9000000-0000-4000-8000-000000000101','f9000000-0000-4000-8000-000000000001','owner',true,'2026-10-01Z'),
 ('f9000000-0000-4000-8000-000000000101','f9000000-0000-4000-8000-000000000002','staff',true,'2026-10-02Z'),
 ('f9000000-0000-4000-8000-000000000101','f9000000-0000-4000-8000-000000000003','staff',false,'2026-10-03Z'),
 ('f9000000-0000-4000-8000-000000000102','f9000000-0000-4000-8000-000000000002','staff',true,'2026-10-04Z');
insert into public.admin_audit_logs(admin_user_id,action,target_type,target_id,reason,request_id,created_at) values
 ('f9000000-0000-4000-8000-000000000001','SHOP_SUSPENDED','store','f9000000-0000-4000-8000-000000000101','Detail fixture','f9000000-0000-4000-8000-000000000201','2026-10-01Z'),
 ('f9000000-0000-4000-8000-000000000001','SHOP_RESTORED','store','f9000000-0000-4000-8000-000000000101','Detail fixture','f9000000-0000-4000-8000-000000000202','2026-10-02Z'),
 ('f9000000-0000-4000-8000-000000000001','SHOP_SUSPENDED','store','f9000000-0000-4000-8000-000000000102','Other store fixture','f9000000-0000-4000-8000-000000000203','2026-10-03Z'),
 ('f9000000-0000-4000-8000-000000000001','USER_DISABLED','user','f9000000-0000-4000-8000-000000000002','Detail fixture','f9000000-0000-4000-8000-000000000204','2026-10-04Z');
insert into public.security_events(event_type,user_id,metadata,created_at) values
 ('ADMIN_RATE_LIMITED','f9000000-0000-4000-8000-000000000001',
 '{"action":"store_status","target_id":"f9000000-0000-4000-8000-000000000101","limit":"intents","token":"must not expose","customers":["private"]}',clock_timestamp());
create function pg_temp.detail(p_resource text,p_target integer,p_offset integer default 0,p_sort text default 'created_desc')
returns jsonb language sql as $$
 select public.admin_read_detail('f9000000-0000-4000-8000-000000000001',p_resource,
 ('f9000000-0000-4000-8000-'||lpad(p_target::text,12,'0'))::uuid,p_offset,1,p_sort);
$$;
set local role service_role;
select is(pg_temp.detail('shop',101)->>'owner_email','detail-admin@example.invalid','Shop overview includes owner contact metadata');
select is((pg_temp.detail('shop',101)->>'member_count')::bigint,2::bigint,'Overview counts active memberships');
select ok(not (pg_temp.detail('shop',101) ?| array['customers','sales','debt','revenue','admin_actions','members']),
 'Shop overview excludes business details and embedded unbounded lists');
select is((pg_temp.detail('shop_members',101)->>'total')::bigint,3::bigint,'Shop roster includes inactive memberships as metadata');
select is(jsonb_array_length(pg_temp.detail('shop_members',101)->'items'),1,'Shop roster is bounded before returning');
select is(pg_temp.detail('shop_members',101)->'items'->0->>'display_name','Inactive Staff','Newest roster order is applied before pagination');
select is(pg_temp.detail('shop_members',101,1)->'items'->0->>'display_name','Detail Staff','Second roster page has a different stable member');
select is(pg_temp.detail('shop_members',101,0,'created_asc')->'items'->0->>'role','owner','Ascending roster order is applied before pagination');
select is((pg_temp.detail('user',2)->>'membership_count')::bigint,2::bigint,'User overview counts active memberships');
select ok(not (pg_temp.detail('user',2) ?| array['memberships','security_events','encrypted_password','raw_user_meta_data','admin_actions']),
 'User overview does not embed provider secrets or unbounded related lists');
select is((pg_temp.detail('user_memberships',2)->>'total')::bigint,2::bigint,'User memberships are independently paginated');
select is(pg_temp.detail('user_memberships',2)->'items'->0->>'store_name','Detail store B','User membership list retains shop status and ordering');
select is(pg_temp.detail('user_memberships',2,1)->'items'->0->>'store_name','Detail store A','User membership offset loads another shop');
select is((pg_temp.detail('shop_activity',101)->>'total')::bigint,2::bigint,'Shop activity excludes another shop and user-target actions');
select is(pg_temp.detail('shop_activity',101)->'items'->0->>'action','SHOP_RESTORED','Shop activity sorts before limiting');
select is((pg_temp.detail('user_activity',2)->>'total')::bigint,1::bigint,'User activity includes only related account/Admin targets');
select is((pg_temp.detail('shop_security',101)->>'total')::bigint,3::bigint,'Shop security includes observed actions and rate denial targeting this store');
select is(pg_temp.detail('shop_security',101)->'items'->0->>'event_type','ADMIN_RATE_LIMITED',
 'Whitelist assertion inspects the fixture with sensitive extra fields');
select ok(not (pg_temp.detail('shop_security',101)->'items'->0->'metadata' ?| array['token','customers']),
 'Security metadata whitelist strips unrelated or secret fields');
select is((pg_temp.detail('user_security',2)->>'total')::bigint,1::bigint,'User security excludes events for other actors');
select is(pg_temp.detail('shop',999),null::jsonb,'Missing target overview returns not found');
select is(pg_temp.detail('shop_members',999),null::jsonb,'Missing parent list returns not found instead of fabricated empty shop');
select is(jsonb_array_length(pg_temp.detail('shop_members',101,100)->'items'),0,'Offset beyond roster returns bounded empty page');
select throws_ok($q$select public.admin_read_detail('f9000000-0000-4000-8000-000000000002','shop',
 'f9000000-0000-4000-8000-000000000101')$q$,'42501',null,'Normal shop owner/staff actor cannot read Admin detail');
select throws_ok($q$select pg_temp.detail('shop_members',101,0,'created_at; drop table stores')$q$,'22023',null,'Detail sorting rejects arbitrary SQL');
select throws_ok($q$select public.admin_read_detail('f9000000-0000-4000-8000-000000000001','shop_members',
 'f9000000-0000-4000-8000-000000000101',0,1000)$q$,'22023',null,'Detail pagination enforces maximum limit');
set local role authenticated;
select throws_ok($q$select pg_temp.detail('shop',101)$q$,'42501',null,'Browser cannot bypass verified Admin Edge');
select * from finish();
rollback;
