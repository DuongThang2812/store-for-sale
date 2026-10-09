-- Auth email is external. Keep delivery state separate from immutable audit.
create table public.admin_reset_deliveries (
  request_id uuid primary key references public.admin_audit_logs(request_id) on delete restrict,
  user_id uuid not null references auth.users(id),
  actor_id uuid not null references auth.users(id),
  status text not null check(status in ('sending','sent','failed')),
  attempt_id uuid not null,
  attempts integer not null default 1,
  lease_until timestamptz,
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.admin_reset_deliveries enable row level security;
revoke all on public.admin_reset_deliveries from public, anon, authenticated;
grant all on public.admin_reset_deliveries to service_role;

create function public.admin_claim_password_reset(p_actor_id uuid, p_user_id uuid,
  p_reason text, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_record jsonb; v_delivery public.admin_reset_deliveries%rowtype; v_attempt uuid;
begin
  perform public.assert_admin_request(p_actor_id,p_request_id,p_reason);
  -- Serialize the per-target send rate limit and request claim.
  perform pg_advisory_xact_lock(hashtextextended('password-reset:' || p_user_id::text,0));
  v_record := public.admin_request_password_reset(p_actor_id,p_user_id,p_reason,p_request_id);
  select * into v_delivery from public.admin_reset_deliveries where request_id=p_request_id for update;
  if found and v_delivery.status='sent' then
    return v_record || jsonb_build_object('should_send',false,'delivery_status','sent');
  end if;
  if found and v_delivery.status='sending' and v_delivery.lease_until > now() then
    return v_record || jsonb_build_object('should_send',false,'delivery_status','sending');
  end if;
  if (select count(*) from public.admin_reset_deliveries where user_id=p_user_id
      and updated_at > now() - interval '1 minute') >= 3
    or (v_delivery.updated_at > now() - interval '20 seconds') then
    raise exception 'Vui lòng chờ trước khi gửi lại email đặt mật khẩu.';
  end if;
  v_attempt := extensions.gen_random_uuid();
  insert into public.admin_reset_deliveries(request_id,user_id,actor_id,status,attempt_id,lease_until)
    values(p_request_id,p_user_id,p_actor_id,'sending',v_attempt,now()+interval '2 minutes')
    on conflict(request_id) do update set status='sending',attempt_id=v_attempt,
      attempts=public.admin_reset_deliveries.attempts+1,lease_until=now()+interval '2 minutes',updated_at=now();
  return v_record || jsonb_build_object('should_send',true,'delivery_status','sending','attempt_id',v_attempt);
end;
$$;
create function public.admin_finish_password_reset(p_actor_id uuid,p_request_id uuid,
  p_attempt_id uuid,p_sent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_active_platform_admin(p_actor_id);
  if p_sent is null then raise exception 'Trạng thái gửi chưa hợp lệ.'; end if;
  update public.admin_reset_deliveries set status=case when p_sent then 'sent' else 'failed' end,
    lease_until=null,sent_at=case when p_sent then now() else null end,updated_at=now()
    where request_id=p_request_id and actor_id=p_actor_id and attempt_id=p_attempt_id and status='sending';
  if not found then raise exception 'Lần gửi email đã đổi; hãy kiểm tra trạng thái hiện tại.'; end if;
end;
$$;
revoke all on function public.admin_claim_password_reset(uuid,uuid,text,uuid),
  public.admin_finish_password_reset(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.admin_claim_password_reset(uuid,uuid,text,uuid),
  public.admin_finish_password_reset(uuid,uuid,uuid,boolean) to service_role;
