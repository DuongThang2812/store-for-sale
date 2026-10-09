-- Preserve existing staff access during the permission migration. New staff
-- default to cash sales only; owners explicitly grant stock/debt operations.
alter table public.store_members add column can_sell boolean,
  add column can_receive_stock boolean, add column can_manage_debt boolean,
  add column permission_version bigint;
update public.store_members set can_sell=true, can_receive_stock=true,
  can_manage_debt=true, permission_version=1;
alter table public.store_members alter column can_sell set default true,
  alter column can_sell set not null, alter column can_receive_stock set default false,
  alter column can_receive_stock set not null, alter column can_manage_debt set default false,
  alter column can_manage_debt set not null, alter column permission_version set default 1,
  alter column permission_version set not null,
  add constraint members_permission_version_positive check(permission_version > 0);

alter table public.stores add column contact_phone text,
  add column address text, add column settings_version bigint not null default 1,
  add constraint stores_contact_phone_length check(char_length(coalesce(contact_phone,'')) <= 30),
  add constraint stores_address_length check(char_length(coalesce(address,'')) <= 300),
  add constraint stores_settings_version_positive check(settings_version > 0);
-- Settings writes now go through an audited RPC, never through direct PATCH.
revoke update on public.stores from authenticated;
revoke update(name,timezone,business_type) on public.stores from authenticated;

create function public.can_store_operation(p_store_id uuid,p_operation text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.store_members m join public.profiles p on p.id=m.user_id
    where m.store_id=p_store_id and m.user_id=(select auth.uid()) and m.is_active
      and p.account_status='active' and p_operation in ('sell','receive_stock','manage_debt','manage_shop')
      and (m.role='owner' or case p_operation
        when 'sell' then m.can_sell when 'receive_stock' then m.can_receive_stock
        when 'manage_debt' then m.can_manage_debt else false end));
$$;
create function public.require_store_operation(p_store_id uuid,p_operation text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_member public.store_members%rowtype; v_status text; v_account text;
begin
  -- Lock lifecycle rows through transaction completion, so a revoke/suspend
  -- cannot race a business write checked against the old permission.
  select status into v_status from public.stores where id=p_store_id for share;
  select m.* into v_member from public.store_members m where m.store_id=p_store_id and m.user_id=auth.uid() for share;
  select account_status into v_account from public.profiles where id=auth.uid() for share;
  if v_status is distinct from 'active' then
    raise exception 'Cửa hàng đang tạm khóa hoặc đã lưu trữ.' using errcode='42501';
  end if;
  if v_account is distinct from 'active'
    or v_member.is_active is distinct from true or not public.can_store_operation(p_store_id,p_operation) then
    raise exception 'Bạn không có quyền thực hiện nghiệp vụ này hoặc cửa hàng đang tạm khóa.' using errcode='42501';
  end if;
end;
$$;
revoke all on function public.can_store_operation(uuid,text),public.require_store_operation(uuid,text) from public,anon;
grant execute on function public.can_store_operation(uuid,text),public.require_store_operation(uuid,text) to authenticated;

create function public.guard_store_operation_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_store uuid; v_operation text;
begin
  if session_user='postgres' and current_setting('role',true) in ('none','postgres') and auth.uid() is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_store := (v_row->>'store_id')::uuid;
  if tg_table_name in ('sales','sale_items','reviewed_sale_requests') then
    v_operation := 'sell';
    if tg_table_name='sales' and tg_op='UPDATE' then
      if v_row->>'status'='cancelled' then v_operation:='manage_shop';
      elsif v_row - 'outstanding_amount' = to_jsonb(old) - 'outstanding_amount' then v_operation:='manage_debt'; end if;
    end if;
    if tg_table_name='sales' and v_row->>'payment_type'='credit' then
      perform public.require_store_operation(v_store,'manage_debt');
    end if;
  elsif tg_table_name in ('stock_receipts','stock_receipt_items') then v_operation:='receive_stock';
  elsif tg_table_name in ('customers','debt_payments','payment_allocations','customer_create_requests') then v_operation:='manage_debt';
  elsif tg_table_name='stock_movements' then
    v_operation := case v_row->>'movement_type' when 'sale' then 'sell'
      when 'purchase' then 'receive_stock' else 'manage_shop' end;
  elsif tg_table_name='product_units' and tg_op='UPDATE'
    and v_row - 'purchase_price' - 'updated_at' = to_jsonb(old) - 'purchase_price' - 'updated_at' then
    v_operation:='receive_stock';
  else v_operation:='manage_shop'; end if;
  perform public.require_store_operation(v_store,v_operation);
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
do $$ declare v_table text; begin
  foreach v_table in array array['sales','sale_items','reviewed_sale_requests',
    'stock_receipts','stock_receipt_items','customers','debt_payments','payment_allocations',
    'customer_create_requests','stock_movements','product_units','categories','suppliers',
    'inventory_counts','inventory_count_items','opening_cost_valuations','sale_cancellation_requests',
    'product_save_requests','stock_csv_imports'] loop
    execute format('create trigger guard_store_operation before insert or update or delete on public.%I for each row execute function public.guard_store_operation_write()',v_table);
  end loop;
end; $$;

-- Staff see their own membership, not the owner-only roster management data.
drop policy members_select_member on public.store_members;
create policy members_select_self_or_owner on public.store_members for select to authenticated
  using (public.is_store_owner(store_id) or (user_id=auth.uid() and public.is_store_member(store_id)));
drop policy customers_select_member on public.customers;
create policy customers_select_permission on public.customers for select to authenticated
  using (public.can_store_operation(store_id,'manage_debt'));
drop policy payments_select_member on public.debt_payments;
create policy payments_select_permission on public.debt_payments for select to authenticated
  using (public.can_store_operation(store_id,'manage_debt'));
drop policy allocations_select_member on public.payment_allocations;
create policy allocations_select_permission on public.payment_allocations for select to authenticated
  using (public.can_store_operation(store_id,'manage_debt'));
drop policy sales_select_member on public.sales;
create policy sales_select_permission on public.sales for select to authenticated
  using (public.is_store_member(store_id) and (payment_type='cash' or public.can_store_operation(store_id,'manage_debt')));
drop policy sale_items_select_member on public.sale_items;
create policy sale_items_select_permission on public.sale_items for select to authenticated
  using (public.is_store_member(store_id) and exists(select 1 from public.sales s where s.id=sale_id and s.store_id=sale_items.store_id));
drop policy audit_select_member on public.audit_logs;
create policy audit_select_owner on public.audit_logs for select to authenticated using(public.is_store_owner(store_id));
drop policy legacy_history_entries_member_read on public.legacy_history_entries;
create policy legacy_history_entries_permission_read on public.legacy_history_entries for select to authenticated
  using(public.is_store_member(store_id) and (public.can_store_operation(store_id,'manage_debt')
    or (customer_id is null and kind not in ('debt','payment'))));
drop policy legacy_customer_links_member_read on public.legacy_customer_links;
create policy legacy_customer_links_permission_read on public.legacy_customer_links for select to authenticated
  using(public.can_store_operation(store_id,'manage_debt'));

create table public.store_configuration_requests (
  store_id uuid not null references public.stores(id) on delete restrict,
  request_id uuid not null, payload_hash text not null,
  result jsonb not null, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), primary key(store_id,request_id)
);
alter table public.store_configuration_requests enable row level security;
revoke all on public.store_configuration_requests from public,anon,authenticated;
create trigger store_configuration_store_guard before insert or update or delete on public.store_configuration_requests
  for each row execute function public.guard_store_business_write();

create function public.list_store_staff(p_store_id uuid,p_offset integer default 0,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_total bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then raise exception 'Chỉ chủ cửa hàng được quản lý nhân viên.' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Phân trang chưa hợp lệ.'; end if;
  select count(*) into v_total from public.store_members where store_id=p_store_id;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from (
    select m.user_id,m.role,m.is_active,m.can_sell,m.can_receive_stock,m.can_manage_debt,
      m.permission_version,m.created_at,p.display_name,p.account_status,u.email
    from public.store_members m join public.profiles p on p.id=m.user_id join auth.users u on u.id=m.user_id
    where m.store_id=p_store_id order by m.role,m.created_at,m.user_id offset p_offset limit p_limit
  ) r;
  return jsonb_build_object('rows',v_rows,'total',v_total);
end;
$$;

create function public.save_store_staff(p_store_id uuid,p_request_id uuid,p_email text,
  p_can_sell boolean default true,p_can_receive_stock boolean default false,
  p_can_manage_debt boolean default false,p_is_active boolean default true,
  p_user_id uuid default null,p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_existing public.store_configuration_requests%rowtype;
  v_user uuid; v_old public.store_members%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then raise exception 'Chỉ chủ cửa hàng được quản lý nhân viên.' using errcode='42501'; end if;
  if p_request_id is null or p_can_sell is null or p_can_receive_stock is null or p_can_manage_debt is null or p_is_active is null
    or (p_user_id is null and (char_length(btrim(coalesce(p_email,''))) not between 3 and 254 or p_email not like '%@%')) then
    raise exception 'Thông tin nhân viên chưa hợp lệ.';
  end if;
  v_hash:=encode(extensions.digest(jsonb_build_array(auth.uid(),'staff',lower(btrim(p_email)),p_user_id,
    p_can_sell,p_can_receive_stock,p_can_manage_debt,p_is_active,p_expected_version)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('store-config:' || p_store_id::text,0));
  perform public.require_store_operation(p_store_id,'manage_shop');
  select * into v_existing from public.store_configuration_requests where store_id=p_store_id and request_id=p_request_id;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'Mã yêu cầu đã dùng cho thay đổi khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate',true);
  end if;
  if p_user_id is null then
    select u.id into v_user from auth.users u join public.profiles p on p.id=u.id
      where lower(u.email)=lower(btrim(p_email)) and p.account_status='active';
  else
    select m.user_id into v_user from public.store_members m where m.store_id=p_store_id and m.user_id=p_user_id;
  end if;
  if v_user is null then raise exception 'Chưa tìm thấy tài khoản đang hoạt động. Nhân viên cần đăng ký trước bằng email này.'; end if;
  select * into v_old from public.store_members where store_id=p_store_id and user_id=v_user for update;
  if found then
    if v_old.role='owner' then raise exception 'Không dùng quản lý nhân viên để thay đổi quyền chủ cửa hàng.'; end if;
    if p_user_id is null then raise exception 'Tài khoản đã thuộc cửa hàng. Hãy sửa quyền trong danh sách.'; end if;
    if p_expected_version is distinct from v_old.permission_version then raise exception 'Quyền nhân viên đã thay đổi. Hãy tải lại trước khi lưu.'; end if;
    update public.store_members set can_sell=p_can_sell,can_receive_stock=p_can_receive_stock,
      can_manage_debt=p_can_manage_debt,is_active=p_is_active,permission_version=permission_version+1
      where store_id=p_store_id and user_id=v_user;
  else
    insert into public.store_members(store_id,user_id,role,is_active,can_sell,can_receive_stock,can_manage_debt)
      values(p_store_id,v_user,'staff',p_is_active,p_can_sell,p_can_receive_stock,p_can_manage_debt);
  end if;
  v_result:=jsonb_build_object('user_id',v_user,'is_active',p_is_active);
  insert into public.audit_logs(store_id,actor_id,action,entity_type,entity_id,details)
    values(p_store_id,auth.uid(),'staff.permissions_saved','store_member',v_user,
      jsonb_build_object('before',to_jsonb(v_old),'after',jsonb_build_object('can_sell',p_can_sell,
        'can_receive_stock',p_can_receive_stock,'can_manage_debt',p_can_manage_debt,'is_active',p_is_active)));
  insert into public.store_configuration_requests(store_id,request_id,payload_hash,result,created_by)
    values(p_store_id,p_request_id,v_hash,v_result,auth.uid());
  return v_result;
end;
$$;

create function public.save_store_settings(p_store_id uuid,p_request_id uuid,p_name text,
  p_contact_phone text,p_address text,p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_existing public.store_configuration_requests%rowtype;
  v_old public.stores%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then raise exception 'Chỉ chủ cửa hàng được sửa cài đặt.' using errcode='42501'; end if;
  if p_request_id is null or char_length(btrim(coalesce(p_name,''))) not between 1 and 120
    or char_length(coalesce(p_contact_phone,''))>30 or char_length(coalesce(p_address,''))>300 then
    raise exception 'Thông tin cửa hàng chưa hợp lệ.';
  end if;
  v_hash:=encode(extensions.digest(jsonb_build_array(auth.uid(),'settings',btrim(p_name),
    nullif(btrim(p_contact_phone),''),nullif(btrim(p_address),''),p_expected_version)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('store-config:' || p_store_id::text,0));
  -- Settings require an exclusive store row before member locks, consistent
  -- with the store -> member -> profile ordering used by business admissions.
  select * into v_old from public.stores where id=p_store_id for update;
  perform public.require_store_operation(p_store_id,'manage_shop');
  select * into v_existing from public.store_configuration_requests where store_id=p_store_id and request_id=p_request_id;
  if found then
    if v_existing.payload_hash<>v_hash then raise exception 'Mã yêu cầu đã dùng cho thay đổi khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate',true);
  end if;
  if p_expected_version is distinct from v_old.settings_version then raise exception 'Cài đặt đã thay đổi. Hãy tải lại trước khi lưu.'; end if;
  update public.stores set name=btrim(p_name),contact_phone=nullif(btrim(p_contact_phone),''),
    address=nullif(btrim(p_address),''),settings_version=settings_version+1 where id=p_store_id;
  v_result:=jsonb_build_object('store_id',p_store_id,'settings_version',v_old.settings_version+1);
  insert into public.audit_logs(store_id,actor_id,action,entity_type,entity_id,details)
    values(p_store_id,auth.uid(),'store.settings_saved','store',p_store_id,
      jsonb_build_object('before',jsonb_build_object('name',v_old.name,'contact_phone',v_old.contact_phone,'address',v_old.address),
        'after',jsonb_build_object('name',btrim(p_name),'contact_phone',p_contact_phone,'address',p_address)));
  insert into public.store_configuration_requests(store_id,request_id,payload_hash,result,created_by)
    values(p_store_id,p_request_id,v_hash,v_result,auth.uid());
  return v_result;
end;
$$;
revoke all on function public.list_store_staff(uuid,integer,integer),
  public.save_store_staff(uuid,uuid,text,boolean,boolean,boolean,boolean,uuid,bigint),
  public.save_store_settings(uuid,uuid,text,text,text,bigint) from public,anon;
grant execute on function public.list_store_staff(uuid,integer,integer),
  public.save_store_staff(uuid,uuid,text,boolean,boolean,boolean,boolean,uuid,bigint),
  public.save_store_settings(uuid,uuid,text,text,text,bigint) to authenticated;
