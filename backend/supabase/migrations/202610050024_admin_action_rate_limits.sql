-- Shared admission for the verified Admin Edge API. Admission is a separate
-- transaction: a downstream failure must not roll back the attempt counter.
create table public.admin_action_admissions (
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  action text not null check (action in ('store_status','user_status','admin_status','password_reset')),
  intent_hash text not null check (length(intent_hash)=64),
  created_at timestamptz not null default clock_timestamp(),
  primary key (actor_id, request_id)
);
create index admin_action_admissions_actor_time_idx
  on public.admin_action_admissions(actor_id,created_at);
create table public.admin_action_rate_windows (
  actor_id uuid primary key references auth.users(id) on delete restrict,
  attempt_times timestamptz[] not null default '{}'
    check (cardinality(attempt_times)<=30),
  last_denied_event_at timestamptz
);
alter table public.admin_action_admissions enable row level security;
alter table public.admin_action_rate_windows enable row level security;
revoke all on public.admin_action_admissions, public.admin_action_rate_windows
  from public, anon, authenticated, service_role;

create function public.admin_admit_action(
  p_actor_id uuid, p_request_id uuid, p_action text, p_target_id uuid,
  p_reason text, p_status text default null, p_enable boolean default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_clock timestamptz;
  v_hash text;
  v_existing public.admin_action_admissions%rowtype;
  v_times timestamptz[];
  v_last_event timestamptz;
  v_count integer;
  v_admin_count integer;
  v_oldest timestamptz;
  v_admin_oldest timestamptz;
  v_retry integer := 0;
  v_limit text;
begin
  perform public.assert_admin_request(p_actor_id,p_request_id,p_reason);
  if p_target_id is null or p_action is null
    or p_action not in ('store_status','user_status','admin_status','password_reset')
    or (p_action='store_status' and (p_status is null or p_status not in ('active','suspended','archived') or p_enable is not null))
    or (p_action='user_status' and (p_status is null or p_status not in ('active','disabled') or p_enable is not null))
    or (p_action='admin_status' and (p_enable is null or p_status is not null))
    or (p_action='password_reset' and (p_status is not null or p_enable is not null)) then
    raise exception using errcode='22023', message='Thao tác quản trị chưa hợp lệ.';
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'action',p_action,'target',p_target_id,'reason',btrim(p_reason),
    'status',p_status,'enable',p_enable)::text,'sha256'),'hex');
  -- Serializes requests from different Edge instances for this actor only.
  perform pg_advisory_xact_lock(hashtextextended('admin-rate:'||p_actor_id::text,0));
  perform public.require_active_platform_admin(p_actor_id);
  v_clock := clock_timestamp(); -- Read after waiting for the shared lock.
  select * into v_existing from public.admin_action_admissions
    where actor_id=p_actor_id and request_id=p_request_id;
  if found and v_existing.intent_hash<>v_hash then
    raise exception using errcode='22023', message='Mã yêu cầu đã dùng cho nội dung khác.';
  end if;
  insert into public.admin_action_rate_windows(actor_id) values(p_actor_id)
    on conflict(actor_id) do nothing;
  select coalesce(array_agg(t order by t),'{}'::timestamptz[])
    into v_times from public.admin_action_rate_windows w,
      lateral unnest(w.attempt_times) t
    where w.actor_id=p_actor_id and t>v_clock-interval '60 seconds';
  select last_denied_event_at into v_last_event from public.admin_action_rate_windows
    where actor_id=p_actor_id;
  if cardinality(v_times)>=30 then
    v_limit := 'attempts';
    v_retry := greatest(1,ceil(extract(epoch from (v_times[1]+interval '60 seconds'-v_clock)))::integer);
  else
    v_times := array_append(v_times,v_clock);
  end if;
  -- Retried intents do not consume the ten-intent / three-admin-change quotas,
  -- but do consume the thirty-attempt quota to bound external Auth retries.
  if v_existing.request_id is null then
    select count(*),min(created_at),count(*) filter(where action='admin_status'),
      min(created_at) filter(where action='admin_status')
      into v_count,v_oldest,v_admin_count,v_admin_oldest
      from public.admin_action_admissions
      where actor_id=p_actor_id and created_at>v_clock-interval '60 seconds';
    if v_count>=10 then
      v_limit := coalesce(v_limit,'intents');
      v_retry := greatest(v_retry,1,ceil(extract(epoch from (v_oldest+interval '60 seconds'-v_clock)))::integer);
    end if;
    if p_action='admin_status' and v_admin_count>=3 then
      v_limit := coalesce(v_limit,'admin_changes');
      v_retry := greatest(v_retry,1,ceil(extract(epoch from (v_admin_oldest+interval '60 seconds'-v_clock)))::integer);
    end if;
  end if;
  update public.admin_action_rate_windows set attempt_times=v_times where actor_id=p_actor_id;
  if v_limit is not null then
    -- Denial is returned, not raised, so the counter and observed event commit.
    -- One event per actor per minute prevents a flood of denied attempts.
    if v_last_event is null or v_last_event<=v_clock-interval '60 seconds' then
      insert into public.security_events(event_type,user_id,metadata,created_at)
        values('ADMIN_RATE_LIMITED',p_actor_id,jsonb_build_object(
          'action',p_action,'target_id',p_target_id,'limit',v_limit),v_clock);
      update public.admin_action_rate_windows set last_denied_event_at=v_clock where actor_id=p_actor_id;
    end if;
    return jsonb_build_object('allowed',false,'retry_after',v_retry);
  end if;
  if v_existing.request_id is null then
    insert into public.admin_action_admissions(actor_id,request_id,action,intent_hash,created_at)
      values(p_actor_id,p_request_id,p_action,v_hash,v_clock);
  end if;
  return jsonb_build_object('allowed',true,'duplicate',v_existing.request_id is not null,'retry_after',0);
end;
$$;
revoke all on function public.admin_admit_action(uuid,uuid,text,uuid,text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.admin_admit_action(uuid,uuid,text,uuid,text,text,boolean) to service_role;
comment on function public.admin_admit_action(uuid,uuid,text,uuid,text,text,boolean) is
  'Admin Edge admission: per actor rolling 60s, 10 new intents, 3 admin changes, 30 attempts including retries. Not a business commit.';
