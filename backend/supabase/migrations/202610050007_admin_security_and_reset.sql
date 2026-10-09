-- Real privileged actions produce security events inside the same transaction.
create or replace function public.audit_admin_security_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.action in ('SHOP_SUSPENDED', 'SHOP_RESTORED', 'SHOP_ARCHIVED',
    'USER_DISABLED', 'USER_ENABLED', 'ADMIN_GRANTED', 'ADMIN_DISABLED',
    'ADMIN_REACTIVATED', 'PASSWORD_RESET_REQUESTED') then
    insert into public.security_events (event_type, user_id, metadata)
    values (new.action,
      case when new.target_type in ('user', 'platform_admin') then new.target_id
        else new.admin_user_id end,
      jsonb_build_object('audit_id', new.id, 'target_type', new.target_type,
        'target_id', new.target_id));
  end if;
  return null;
end;
$$;
create trigger admin_audit_security_event after insert on public.admin_audit_logs
  for each row execute function public.audit_admin_security_event();

-- An email is an external side effect and cannot be part of a PostgreSQL
-- transaction. Record the *request* first; the Edge Function then asks Auth to
-- send the email. A retry reuses the same request ID and audit entry.
create or replace function public.admin_request_password_reset(
  p_actor_id uuid, p_user_id uuid, p_reason text, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_existing public.admin_audit_logs%rowtype;
begin
  perform public.assert_admin_request(p_actor_id, p_request_id, p_reason);
  perform pg_advisory_xact_lock(hashtextextended('admin:' || p_request_id::text, 0));
  select * into v_existing from public.admin_audit_logs where request_id = p_request_id;
  if found then
    if v_existing.admin_user_id <> p_actor_id or v_existing.target_type <> 'user'
      or v_existing.target_id <> p_user_id
      or v_existing.action <> 'PASSWORD_RESET_REQUESTED' then
      raise exception 'Mã yêu cầu đã dùng cho thao tác khác.';
    end if;
    return jsonb_build_object('user_id', p_user_id, 'duplicate', true);
  end if;
  if not exists (select 1 from auth.users where id = p_user_id and email is not null) then
    raise exception 'Không tìm thấy email của tài khoản.';
  end if;
  insert into public.admin_audit_logs (admin_user_id, action, target_type,
    target_id, reason, request_id, after_data)
  values (p_actor_id, 'PASSWORD_RESET_REQUESTED', 'user', p_user_id,
    btrim(p_reason), p_request_id, '{"requested":true}'::jsonb);
  return jsonb_build_object('user_id', p_user_id, 'duplicate', false);
end;
$$;
revoke all on function public.admin_request_password_reset(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_request_password_reset(uuid, uuid, text, uuid)
  to service_role;
