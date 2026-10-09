-- Privileged Admin commands are callable only with the server-held service key.
-- The Edge Function verifies the caller's JWT and AAL2 before passing actor_id.
create or replace function public.require_active_platform_admin(p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_actor_id is null or not exists (
    select 1 from public.platform_admins a
    join public.profiles p on p.id = a.user_id
    where a.user_id = p_actor_id and a.is_active and p.account_status = 'active'
  ) then
    raise exception 'Tài khoản không có quyền quản trị nền tảng.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_active_platform_admin(uuid) from public, anon, authenticated;
grant execute on function public.require_active_platform_admin(uuid) to service_role;

create or replace function public.assert_admin_request(p_actor_id uuid, p_request_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active_platform_admin(p_actor_id);
  if p_request_id is null then raise exception 'Thiếu mã yêu cầu.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'Lý do cần từ 5 đến 500 ký tự.';
  end if;
end;
$$;
revoke all on function public.assert_admin_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assert_admin_request(uuid, uuid, text) to service_role;

create or replace function public.admin_change_store_status(
  p_actor_id uuid, p_store_id uuid, p_new_status text,
  p_reason text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.stores%rowtype;
  v_action text;
  v_existing public.admin_audit_logs%rowtype;
begin
  perform public.assert_admin_request(p_actor_id, p_request_id, p_reason);
  if p_new_status not in ('active', 'suspended', 'archived') then
    raise exception 'Trạng thái cửa hàng chưa hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('admin:' || p_request_id::text, 0));
  select * into v_existing from public.admin_audit_logs where request_id = p_request_id;
  if found then
    if v_existing.admin_user_id <> p_actor_id or v_existing.target_type <> 'store'
      or v_existing.target_id <> p_store_id
      or v_existing.after_data ->> 'status' <> p_new_status then
      raise exception 'Mã yêu cầu đã dùng cho thao tác khác.';
    end if;
    return jsonb_build_object('store_id', p_store_id, 'status', p_new_status, 'duplicate', true);
  end if;
  select * into v_old from public.stores where id = p_store_id for update;
  if not found then raise exception 'Không tìm thấy cửa hàng.'; end if;
  if v_old.status = p_new_status then raise exception 'Cửa hàng đã ở trạng thái này.'; end if;
  if v_old.status = 'archived' or (p_new_status = 'active' and v_old.status <> 'suspended') then
    raise exception 'Không thể chuyển trạng thái cửa hàng theo cách này.';
  end if;
  v_action := case p_new_status
    when 'active' then 'SHOP_RESTORED'
    when 'suspended' then 'SHOP_SUSPENDED'
    else 'SHOP_ARCHIVED' end;
  update public.stores set status = p_new_status where id = p_store_id;
  insert into public.admin_audit_logs (admin_user_id, action, target_type,
    target_id, reason, before_data, after_data, request_id)
  values (p_actor_id, v_action, 'store', p_store_id, btrim(p_reason),
    jsonb_build_object('status', v_old.status),
    jsonb_build_object('status', p_new_status), p_request_id);
  return jsonb_build_object('store_id', p_store_id, 'status', p_new_status, 'duplicate', false);
end;
$$;
revoke all on function public.admin_change_store_status(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_change_store_status(uuid, uuid, text, text, uuid)
  to service_role;

create or replace function public.admin_change_user_status(
  p_actor_id uuid, p_user_id uuid, p_new_status text,
  p_reason text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.profiles%rowtype;
  v_existing public.admin_audit_logs%rowtype;
begin
  perform public.assert_admin_request(p_actor_id, p_request_id, p_reason);
  if p_new_status not in ('active', 'disabled') then
    raise exception 'Trạng thái tài khoản chưa hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('admin:' || p_request_id::text, 0));
  select * into v_existing from public.admin_audit_logs where request_id = p_request_id;
  if found then
    if v_existing.admin_user_id <> p_actor_id or v_existing.target_type <> 'user'
      or v_existing.target_id <> p_user_id
      or v_existing.after_data ->> 'status' <> p_new_status then
      raise exception 'Mã yêu cầu đã dùng cho thao tác khác.';
    end if;
    return jsonb_build_object('user_id', p_user_id, 'status', p_new_status, 'duplicate', true);
  end if;
  select * into v_old from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Không tìm thấy tài khoản.'; end if;
  if v_old.account_status = p_new_status then raise exception 'Tài khoản đã ở trạng thái này.'; end if;
  if p_new_status = 'disabled' and exists (
    select 1 from public.platform_admins where user_id = p_user_id and is_active
  ) then raise exception 'Vô hiệu quản trị viên trước khi vô hiệu tài khoản.'; end if;
  update public.profiles set account_status = p_new_status where id = p_user_id;
  insert into public.admin_audit_logs (admin_user_id, action, target_type,
    target_id, reason, before_data, after_data, request_id)
  values (p_actor_id, case p_new_status when 'active' then 'USER_ENABLED' else 'USER_DISABLED' end,
    'user', p_user_id, btrim(p_reason),
    jsonb_build_object('status', v_old.account_status),
    jsonb_build_object('status', p_new_status), p_request_id);
  return jsonb_build_object('user_id', p_user_id, 'status', p_new_status, 'duplicate', false);
end;
$$;
revoke all on function public.admin_change_user_status(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_change_user_status(uuid, uuid, text, text, uuid)
  to service_role;

create or replace function public.admin_change_admin_status(
  p_actor_id uuid, p_user_id uuid, p_enable boolean,
  p_reason text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.platform_admins%rowtype;
  v_existing public.admin_audit_logs%rowtype;
  v_action text;
begin
  perform public.assert_admin_request(p_actor_id, p_request_id, p_reason);
  if p_enable is null then raise exception 'Trạng thái quản trị viên chưa hợp lệ.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('platform_admin_lifecycle', 0));
  select * into v_existing from public.admin_audit_logs where request_id = p_request_id;
  if found then
    if v_existing.admin_user_id <> p_actor_id or v_existing.target_type <> 'platform_admin'
      or v_existing.target_id <> p_user_id
      or (v_existing.after_data ->> 'is_active')::boolean <> p_enable then
      raise exception 'Mã yêu cầu đã dùng cho thao tác khác.';
    end if;
    return jsonb_build_object('user_id', p_user_id, 'is_active', p_enable, 'duplicate', true);
  end if;
  if not exists (select 1 from public.profiles
    where id = p_user_id and account_status = 'active') then
    raise exception 'Chỉ cấp quyền cho tài khoản đang hoạt động.';
  end if;
  select * into v_old from public.platform_admins where user_id = p_user_id for update;
  if not found then
    if not p_enable then raise exception 'Tài khoản chưa phải quản trị viên.'; end if;
    insert into public.platform_admins (user_id, created_by)
      values (p_user_id, p_actor_id);
    v_action := 'ADMIN_GRANTED';
  else
    if v_old.is_active = p_enable then raise exception 'Quản trị viên đã ở trạng thái này.'; end if;
    if not p_enable and (select count(*) from public.platform_admins where is_active) <= 1 then
      raise exception 'Không thể vô hiệu quản trị viên cuối cùng.';
    end if;
    update public.platform_admins set is_active = p_enable where user_id = p_user_id;
    v_action := case when p_enable then 'ADMIN_REACTIVATED' else 'ADMIN_DISABLED' end;
  end if;
  insert into public.admin_audit_logs (admin_user_id, action, target_type,
    target_id, reason, before_data, after_data, request_id)
  values (p_actor_id, v_action, 'platform_admin', p_user_id,
    btrim(p_reason), jsonb_build_object('is_active', coalesce(v_old.is_active, false)),
    jsonb_build_object('is_active', p_enable), p_request_id);
  return jsonb_build_object('user_id', p_user_id, 'is_active', p_enable, 'duplicate', false);
end;
$$;
revoke all on function public.admin_change_admin_status(uuid, uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_change_admin_status(uuid, uuid, boolean, text, uuid)
  to service_role;

create or replace function public.prevent_admin_audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Nhật ký quản trị chỉ được ghi thêm.' using errcode = '42501';
end;
$$;
create trigger admin_audit_append_only before update or delete on public.admin_audit_logs
  for each row execute function public.prevent_admin_audit_change();
