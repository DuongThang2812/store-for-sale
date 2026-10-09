begin;
create function public.validation_assert(p_ok boolean,p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'ASSERTION FAILED: %',p_message; end if; end; $$;
create function public.validation_throws(p_sql text,p_state text,p_message text) returns void language plpgsql as $$
declare v_state text;
begin
  begin execute p_sql; exception when others then get stacked diagnostics v_state=returned_sqlstate; end;
  if v_state is distinct from p_state then raise exception 'ASSERTION FAILED: %; expected %, got %',p_message,p_state,v_state; end if;
end; $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('fc000000-0000-4000-8000-000000000001','staff-owner@example.invalid','{}'),
 ('fc000000-0000-4000-8000-000000000002','new-staff@example.invalid','{}'),
 ('fc000000-0000-4000-8000-000000000003','other-owner@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select set_config('test.store',public.create_store('Staff settings test')::text,true);
select set_config('test.product',public.save_product(current_setting('test.store')::uuid,'Nước staff','Nước','other','lon',
 '[{"key":"base","name":"lon","factor":1,"purchase_price":6000,"sale_price":10000,"can_purchase":true,"can_sell":true}]',0)::text,true);
select public.receive_stock(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000101',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'quantity',10,'unit_key','base','unit_cost',6000)));
select set_config('test.customer',(public.create_customer(current_setting('test.store')::uuid,
 'fc000000-0000-4000-8000-000000000102','Khách nợ riêng')->>'customer_id'),true);
select public.create_sale(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000103',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'quantity',3,'unit_key','base')),
 'credit',current_setting('test.customer')::uuid);
select public.save_store_staff(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000104','new-staff@example.invalid');
select public.validation_assert((public.save_store_staff(current_setting('test.store')::uuid,
 'fc000000-0000-4000-8000-000000000104','new-staff@example.invalid')->>'duplicate')::boolean,'staff add retry creates one member');
select public.validation_assert((public.list_store_staff(current_setting('test.store')::uuid)->>'total')::bigint=2,'owner roster includes owner and staff');
select public.save_store_settings(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000105','BIN mới','0900000000','Địa chỉ thử',1);
select public.validation_assert((public.save_store_settings(current_setting('test.store')::uuid,
 'fc000000-0000-4000-8000-000000000105','BIN mới','0900000000','Địa chỉ thử',1)->>'duplicate')::boolean,'settings retry is idempotent');
select public.validation_assert((select name from public.stores where id=current_setting('test.store')::uuid)='BIN mới','settings persists name');
select public.validation_throws(format($q$select public.save_store_settings(%L,'fc000000-0000-4000-8000-000000000106','Stale','','',1)$q$,current_setting('test.store')),
 'P0001','stale settings cannot overwrite a newer edit');
select public.validation_throws(format($q$update public.stores set name='Direct PATCH' where id=%L$q$,current_setting('test.store')),'42501','owner cannot bypass settings RPC/audit');
select public.validation_throws(format($q$select public.save_store_staff(%L,'fc000000-0000-4000-8000-000000000107',null,true,true,true,false,
 'fc000000-0000-4000-8000-000000000001',1)$q$,current_setting('test.store')),'P0001','staff management cannot remove owner');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select public.validation_assert(public.can_store_operation(current_setting('test.store')::uuid,'sell'),'new staff can sell cash');
select public.validation_assert(not public.can_store_operation(current_setting('test.store')::uuid,'receive_stock'),'new staff does not get stock permission by default');
select public.validation_assert(not public.can_store_operation(current_setting('test.store')::uuid,'manage_debt'),'new staff does not get debt permission by default');
select public.validation_assert((select count(*) from public.customers where store_id=current_setting('test.store')::uuid)=0,'staff cannot read customers without debt permission');
select public.validation_assert((select count(*) from public.sales where store_id=current_setting('test.store')::uuid)=0,'staff cannot read credit sales without debt permission');
select public.validation_assert(jsonb_array_length(public.shop_activity(current_setting('test.store')::uuid,0,50,'debt')->'events')=0,'server-definer history cannot bypass debt permission');
select public.validation_assert((select count(*) from public.store_members where store_id=current_setting('test.store')::uuid)=1,'staff sees own membership only');
select public.validation_throws(format($q$select public.list_store_staff(%L)$q$,current_setting('test.store')),'42501','staff cannot use owner roster API');
select public.validation_throws(format($q$update public.store_members set can_manage_debt=true where store_id=%L$q$,current_setting('test.store')),'42501','staff cannot self grant permissions');
select public.validation_throws(format($q$select public.create_customer(%L,'fc000000-0000-4000-8000-000000000108','Forbidden customer')$q$,current_setting('test.store')),'42501','staff cannot create debt customers without permission');
select public.validation_throws(format($q$select public.receive_stock(%L,'fc000000-0000-4000-8000-000000000109',
 '[{"product_id":"%s","quantity":1,"unit_key":"base","unit_cost":6000}]')$q$,current_setting('test.store'),current_setting('test.product')),'42501','legacy receipt RPC enforces staff permission');
select public.validation_throws(format($q$select public.record_debt_payment(%L,%L,1000,'fc000000-0000-4000-8000-000000000110')$q$,
 current_setting('test.store'),current_setting('test.customer')),'42501','payment RPC enforces debt permission');
select public.create_sale(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000111',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'quantity',1,'unit_key','base')));
select public.validation_assert((select stock_base from public.products where id=current_setting('test.product')::uuid)=6,'allowed staff cash sale updates stock');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select public.save_store_staff(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000112',null,false,true,true,true,
 'fc000000-0000-4000-8000-000000000002',1);
select public.validation_throws(format($q$select public.save_store_staff(%L,'fc000000-0000-4000-8000-000000000113',null,true,false,false,true,
 'fc000000-0000-4000-8000-000000000002',1)$q$,current_setting('test.store')),'P0001','stale permission version rejected');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select public.receive_stock(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000114',
 jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'quantity',2,'unit_key','base','unit_cost',7000)));
select public.validation_assert((select stock_base from public.products where id=current_setting('test.product')::uuid)=8,'granted receipt permission includes purchase price update and movement');
select public.record_debt_payment(current_setting('test.store')::uuid,current_setting('test.customer')::uuid,1000,'fc000000-0000-4000-8000-000000000115');
select public.validation_assert((select current_debt from public.customers where id=current_setting('test.customer')::uuid)=29000,'debt-only staff can collect without selling permission');
select public.validation_throws(format($q$select public.create_sale(%L,'fc000000-0000-4000-8000-000000000116',
 '[{"product_id":"%s","quantity":1,"unit_key":"base"}]')$q$,current_setting('test.store'),current_setting('test.product')),'42501','revoked selling permission stops old RPC');
select public.validation_throws(format($q$select public.create_sale(%L,'fc000000-0000-4000-8000-000000000111',
 '[{"product_id":"%s","quantity":1,"unit_key":"base"}]')$q$,current_setting('test.store'),current_setting('test.product')),'42501','revoked permission also stops replay of a committed request');

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select public.save_store_staff(current_setting('test.store')::uuid,'fc000000-0000-4000-8000-000000000117',null,false,true,true,false,
 'fc000000-0000-4000-8000-000000000002',2);
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
select public.validation_assert((select count(*) from public.products where store_id=current_setting('test.store')::uuid)=0,'deactivated membership blocks existing JWT reads');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
select public.validation_throws(format($q$select public.list_store_staff(%L)$q$,current_setting('test.store')),'42501','another shop owner cannot read roster');
select public.validation_throws(format($q$select public.save_store_settings(%L,'fc000000-0000-4000-8000-000000000118','Other shop','','',2)$q$,current_setting('test.store')),'42501','another shop owner cannot change settings');
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
select public.validation_assert((select count(*) from public.sales where store_id=current_setting('test.store')::uuid)=2,'staff deactivation preserves historical sales');
select public.validation_assert((select count(*) from public.audit_logs where store_id=current_setting('test.store')::uuid and action='staff.permissions_saved')=3,'staff changes each have atomic audit');
rollback;
