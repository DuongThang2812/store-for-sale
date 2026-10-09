-- Runs only in the disposable cluster created by validate-postgres-isolated.mjs.
begin;
create function public.validation_assert(p_ok boolean, p_message text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;
insert into auth.users(id,email,raw_user_meta_data) values
  ('fa000000-0000-4000-8000-000000000001','owner@example.invalid','{}'),
  ('fa000000-0000-4000-8000-000000000002','staff@example.invalid','{}'),
  ('fa000000-0000-4000-8000-000000000003','stranger@example.invalid','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000001',true);
select set_config('test.store', public.create_store('Cloud review test')::text,true);
select set_config('test.product_command', '{"p_name":"Nước test","p_category":"Nước","p_product_group":"other","p_base_unit":"lon","p_opening_stock":0,"p_low_stock_threshold":5,"p_is_active":true,"p_product_id":null,"p_units":[{"key":"base","name":"lon","factor":1,"purchase_price":6000,"sale_price":10000,"can_purchase":true,"can_sell":true}]}'::text,true);
select set_config('test.product', public.save_product_idempotent(current_setting('test.store')::uuid,
  'fa000000-0000-4000-8000-000000000101',current_setting('test.product_command')::jsonb)::text,true);
select public.validation_assert(public.save_product_idempotent(current_setting('test.store')::uuid,
  'fa000000-0000-4000-8000-000000000101',current_setting('test.product_command')::jsonb)::text = current_setting('test.product'), 'product creation retry returns original ID');
select public.receive_stock(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000102',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'unit_key','base','quantity',20,'unit_cost',6000)));
select public.validation_assert((public.inventory_product_cost(current_setting('test.store')::uuid,current_setting('test.product')::uuid)->>'cost_known')::boolean,'receipt sets average cost');
select set_config('test.customer', (public.create_customer(current_setting('test.store')::uuid,
  'fa000000-0000-4000-8000-000000000103','Cô Lan')->>'customer_id'),true);
select set_config('test.sale', (public.create_sale(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000104',
  jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),'unit_key','base','quantity',3)),
  'credit',current_setting('test.customer')::uuid)->>'sale_id'),true);
select set_config('test.preview',public.preview_sale_cancellation(current_setting('test.store')::uuid,current_setting('test.sale')::uuid)::text,true);
select public.record_debt_payment(current_setting('test.store')::uuid,current_setting('test.customer')::uuid,10000,
  'fa000000-0000-4000-8000-000000000105');
do $$
begin
  begin
    perform public.cancel_sale_confirmed(current_setting('test.store')::uuid,current_setting('test.sale')::uuid,'Khách trả hàng',
      'fa000000-0000-4000-8000-000000000106',current_setting('test.preview')::jsonb->>'preview_token');
    raise exception 'ASSERTION FAILED: stale cancellation was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Số tiền hoàn hoặc công nợ đã thay đổi. Hãy mở lại xác nhận hủy đơn.' then raise; end if;
  end;
end; $$;
select public.validation_assert((select stock_base from public.products where id=current_setting('test.product')::uuid)=17,'stale cancellation does not change stock');
select set_config('test.preview',public.preview_sale_cancellation(current_setting('test.store')::uuid,current_setting('test.sale')::uuid)::text,true);
select public.validation_assert((current_setting('test.preview')::jsonb->>'refund_amount')::bigint=10000
  and (current_setting('test.preview')::jsonb->>'debt_reduction')::bigint=20000,'preview uses actual allocated debt');
select public.cancel_sale_confirmed(current_setting('test.store')::uuid,current_setting('test.sale')::uuid,'Khách trả hàng',
  'fa000000-0000-4000-8000-000000000106',current_setting('test.preview')::jsonb->>'preview_token');
select public.validation_assert((public.cancel_sale_confirmed(current_setting('test.store')::uuid,current_setting('test.sale')::uuid,'Khách trả hàng',
  'fa000000-0000-4000-8000-000000000106',current_setting('test.preview')::jsonb->>'preview_token')->>'duplicate')::boolean,'committed cancel retry succeeds');
select public.validation_assert((select stock_base from public.products where id=current_setting('test.product')::uuid)=20,'cancel restores stock exactly once');
select public.validation_assert((select current_debt from public.customers where id=current_setting('test.customer')::uuid)=0,'cancel clears only remaining debt');
select set_config('test.count',jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),
  'actual_base',19,'reason','Hao hụt khi đếm','expected_version',(select version from public.products where id=current_setting('test.product')::uuid)))::text,true);
select public.record_inventory_count_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000107',current_setting('test.count')::jsonb);
select public.validation_assert((public.record_inventory_count_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000107',current_setting('test.count')::jsonb)->>'duplicate')::boolean,'count retry succeeds despite changed version');
do $$
begin
  begin
    perform public.record_inventory_count_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000108',current_setting('test.count')::jsonb);
    raise exception 'ASSERTION FAILED: stale count was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Kho đã có giao dịch mới. Hãy tải lại và đếm lại mặt hàng trước khi kiểm kê.' then raise; end if;
  end;
end; $$;
select public.validation_assert(jsonb_array_length(public.shop_activity(current_setting('test.store')::uuid,0,2)->'events')=2,'history first page has exact size');
select public.validation_assert((public.shop_activity(current_setting('test.store')::uuid,0,2)->>'has_more')::boolean,'history exposes older pages');
select public.validation_assert(jsonb_array_length(public.shop_activity(current_setting('test.store')::uuid,0,50,'payment',current_setting('test.customer')::uuid)->'events')=1,'customer history filters in server');
select public.validation_assert(jsonb_array_length(public.shop_activity(current_setting('test.store')::uuid,0,50,null,null,current_setting('test.product')::uuid)->'events')=4,'product history includes sale cancellation receipt count');
select set_config('test.reviewed_items',jsonb_build_array(jsonb_build_object('product_id',current_setting('test.product'),
  'unit_key','base','quantity',1,'expected_version',(select version from public.products where id=current_setting('test.product')::uuid)))::text,true);
select public.create_sale_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000109',current_setting('test.reviewed_items')::jsonb);
select public.validation_assert((public.create_sale_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000109',
  jsonb_set(current_setting('test.reviewed_items')::jsonb,'{0,expected_version}','999'::jsonb))->>'duplicate')::boolean,'reviewed sale retry returns receipt even after UI reload changed version');
do $$
begin
  begin
    perform public.create_sale_reviewed(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000110',current_setting('test.reviewed_items')::jsonb);
    raise exception 'ASSERTION FAILED: stale sale was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Giá hoặc tồn kho đã thay đổi. Hãy tải lại giỏ hàng và xác nhận số tiền mới.' then raise; end if;
  end;
end; $$;
select public.validation_assert((select stock_base from public.products where id=current_setting('test.product')::uuid)=18,'stale price/stock confirmation does not create another sale');
select public.validation_assert((public.management_report(current_setting('test.store')::uuid,1)->'totals'->>'revenue')::bigint=10000,'report excludes cancelled revenue');
select public.validation_assert((public.management_report(current_setting('test.store')::uuid,1)->'totals'->>'cogs')::bigint=6000,'report uses frozen cost at sale');
reset role;
insert into public.platform_admins(user_id,created_by) values('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001');
set local role service_role;
select set_config('test.reset_claim',public.admin_claim_password_reset('fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002','Người dùng yêu cầu khôi phục','fa000000-0000-4000-8000-000000000201')::text,true);
select public.validation_assert((current_setting('test.reset_claim')::jsonb->>'should_send')::boolean,'reset obtains durable send lease');
select public.validation_assert(not (public.admin_claim_password_reset('fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002','Người dùng yêu cầu khôi phục','fa000000-0000-4000-8000-000000000201')->>'should_send')::boolean,'reset concurrent duplicate does not send twice');
select public.admin_finish_password_reset('fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000201',
  (current_setting('test.reset_claim')::jsonb->>'attempt_id')::uuid,true);
select public.validation_assert(public.admin_claim_password_reset('fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002','Người dùng yêu cầu khôi phục','fa000000-0000-4000-8000-000000000201')->>'delivery_status'='sent','reset success retry never requests resend');
reset role;
insert into public.store_members(store_id,user_id,role) values(current_setting('test.store')::uuid,'fa000000-0000-4000-8000-000000000002','staff');
set local role authenticated;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000002',true);
select public.validation_assert(public.shop_activity(current_setting('test.store')::uuid,0,50,'stock')->'events'->0->'purchase_total'='null'::jsonb,'staff activity hides purchase totals');
do $$
begin
  begin
    perform public.inventory_product_cost(current_setting('test.store')::uuid,current_setting('test.product')::uuid);
    raise exception 'ASSERTION FAILED: staff cost read was accepted';
  exception when raise_exception then if sqlerrm <> 'Chỉ chủ cửa hàng được xem giá vốn.' then raise; end if; end;
end; $$;
select set_config('request.jwt.claim.sub','fa000000-0000-4000-8000-000000000003',true);
do $$
begin
  begin
    perform public.shop_activity(current_setting('test.store')::uuid);
    raise exception 'ASSERTION FAILED: another shop user saw history';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
