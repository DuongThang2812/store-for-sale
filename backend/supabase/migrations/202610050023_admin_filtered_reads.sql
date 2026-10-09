-- Bounded lists share filters/order at the database. The original admin_read
-- remains available for deployed clients; this new RPC is service-role only.
create function public.admin_read_filtered(
  p_actor_id uuid,p_resource text,p_offset integer default 0,p_limit integer default 20,
  p_query text default null,p_filter text default null,p_target_id uuid default null,
  p_from timestamptz default null,p_to timestamptz default null,
  p_sort text default 'created_desc',p_business_type text default null,
  p_admin_id uuid default null,p_action text default null,p_event_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_query text:=nullif(btrim(p_query),''); v_result jsonb;
begin
  perform public.require_active_platform_admin(p_actor_id);
  if p_resource is null or p_resource not in ('dashboard','shops','shop','users','user','admins','audit','security','system')
    or p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 100
    or char_length(coalesce(v_query,''))>120 or char_length(coalesce(p_filter,''))>80
    or char_length(coalesce(p_action,''))>80
    or (p_from is not null and p_to is not null and p_from>=p_to)
    or p_sort is null or p_sort not in ('created_desc','created_asc','name_asc','name_desc')
    or (p_sort in ('name_asc','name_desc') and p_resource not in ('shops','users','admins'))
    or (p_business_type is not null and (p_resource<>'shops' or p_business_type not in ('grocery','fruit_shop')))
    or (p_admin_id is not null and p_resource<>'audit')
    or (p_action is not null and p_resource<>'audit')
    or (p_event_user_id is not null and p_resource<>'security') then
    raise exception 'Bộ lọc hoặc sắp xếp chưa hợp lệ.' using errcode='22023';
  end if;
  if (p_resource='shops' and coalesce(p_filter,'all') not in ('all','active','suspended','archived','grocery','fruit_shop'))
    or (p_resource='users' and coalesce(p_filter,'all') not in ('all','active','disabled','owner','staff'))
    or (p_resource='admins' and coalesce(p_filter,'all') not in ('all','active','disabled'))
    or (p_resource='audit' and coalesce(p_filter,'all') not in ('all','store','user','platform_admin')) then
    raise exception 'Bộ lọc chưa hợp lệ.' using errcode='22023';
  end if;
  if p_resource not in ('shops','users','admins','audit','security') then
    return public.admin_read(p_actor_id,p_resource,p_offset,p_limit,v_query,p_filter,p_target_id,p_from,p_to);
  end if;

  if p_resource='shops' then
    with matched as (
      select s.id,s.name,s.business_type,s.status,s.created_at,s.created_by,
        p.display_name as owner_name,u.email as owner_email
      from public.stores s left join public.profiles p on p.id=s.created_by
        left join auth.users u on u.id=s.created_by
      where (v_query is null or s.name ilike '%'||v_query||'%' or p.display_name ilike '%'||v_query||'%'
        or u.email ilike '%'||v_query||'%')
        and (p_filter is null or p_filter='all' or p_filter=s.status or p_filter=s.business_type)
        and (p_business_type is null or s.business_type=p_business_type)
        and (p_from is null or s.created_at>=p_from) and (p_to is null or s.created_at<p_to)
    ), ordered as (
      select m.*,row_number() over(order by
        case when p_sort='name_asc' then lower(m.name) end asc,
        case when p_sort='name_desc' then lower(m.name) end desc,
        case when p_sort='created_asc' then m.created_at end asc,
        case when p_sort='created_desc' then m.created_at end desc,m.id desc) as _order
      from matched m
    ), page as (
      select o.*, (select count(*) from public.store_members sm where sm.store_id=o.id and sm.is_active) as member_count,
        (select count(*) from public.products x where x.store_id=o.id) as product_count,
        (select max(a.created_at) from public.audit_logs a where a.store_id=o.id) as last_activity_at
      from ordered o order by _order limit p_limit offset p_offset
    ) select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page)-'_order' order by _order) from page),'[]'::jsonb)) into v_result;

  elsif p_resource='users' then
    with matched as (
      select u.id,u.email,u.created_at,p.display_name,p.account_status
      from auth.users u join public.profiles p on p.id=u.id
      where (v_query is null or p.display_name ilike '%'||v_query||'%' or u.email ilike '%'||v_query||'%')
        and (p_filter is null or p_filter='all' or p_filter=p.account_status
          or exists(select 1 from public.store_members m where m.user_id=u.id and m.is_active and m.role=p_filter))
        and (p_from is null or u.created_at>=p_from) and (p_to is null or u.created_at<p_to)
    ), ordered as (
      select m.*,row_number() over(order by
        case when p_sort='name_asc' then lower(m.display_name) end asc,
        case when p_sort='name_desc' then lower(m.display_name) end desc,
        case when p_sort='created_asc' then m.created_at end asc,
        case when p_sort='created_desc' then m.created_at end desc,m.id desc) as _order
      from matched m
    ), page as (
      select o.*, (select count(*) from public.store_members sm where sm.user_id=o.id and sm.is_active) as shop_count,
        (select coalesce(jsonb_agg(distinct sm.role),'[]'::jsonb) from public.store_members sm where sm.user_id=o.id and sm.is_active) as roles
      from ordered o order by _order limit p_limit offset p_offset
    ) select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page)-'_order' order by _order) from page),'[]'::jsonb)) into v_result;

  elsif p_resource='admins' then
    with matched as (
      select a.id,a.user_id,a.admin_role,a.is_active,a.created_at,p.display_name,u.email
      from public.platform_admins a join public.profiles p on p.id=a.user_id join auth.users u on u.id=a.user_id
      where (v_query is null or p.display_name ilike '%'||v_query||'%' or u.email ilike '%'||v_query||'%')
        and (p_filter is null or p_filter='all' or (p_filter='active' and a.is_active) or (p_filter='disabled' and not a.is_active))
        and (p_from is null or a.created_at>=p_from) and (p_to is null or a.created_at<p_to)
    ), ordered as (
      select m.*,row_number() over(order by
        case when p_sort='name_asc' then lower(m.display_name) end asc,
        case when p_sort='name_desc' then lower(m.display_name) end desc,
        case when p_sort='created_asc' then m.created_at end asc,
        case when p_sort='created_desc' then m.created_at end desc,m.id desc) as _order from matched m
    ), page as (select * from ordered order by _order limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page)-'_order' order by _order) from page),'[]'::jsonb)) into v_result;

  elsif p_resource='audit' then
    with matched as (
      select a.id,a.admin_user_id,a.action,a.target_type,a.target_id,a.reason,
        a.before_data,a.after_data,a.metadata,a.created_at,p.display_name as admin_name
      from public.admin_audit_logs a left join public.profiles p on p.id=a.admin_user_id
      where (v_query is null or a.action ilike '%'||v_query||'%' or a.reason ilike '%'||v_query||'%')
        and (p_filter is null or p_filter='all' or a.target_type=p_filter)
        and (p_admin_id is null or a.admin_user_id=p_admin_id) and (p_action is null or a.action=p_action)
        and (p_from is null or a.created_at>=p_from) and (p_to is null or a.created_at<p_to)
    ), ordered as (
      select m.*,row_number() over(order by
        case when p_sort='created_asc' then m.created_at end asc,
        case when p_sort='created_desc' then m.created_at end desc,m.id desc) as _order from matched m
    ), page as (select * from ordered order by _order limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page)-'_order' order by _order) from page),'[]'::jsonb)) into v_result;

  else -- security: observed events only, not fabricated Auth failures.
    with matched as (
      select e.id,e.event_type,e.user_id,e.metadata,e.created_at,p.display_name as user_name
      from public.security_events e left join public.profiles p on p.id=e.user_id
      where (v_query is null or e.event_type ilike '%'||v_query||'%')
        and (p_filter is null or p_filter='all' or e.event_type=p_filter)
        and (p_event_user_id is null or e.user_id=p_event_user_id)
        and (p_from is null or e.created_at>=p_from) and (p_to is null or e.created_at<p_to)
    ), ordered as (
      select m.*,row_number() over(order by
        case when p_sort='created_asc' then m.created_at end asc,
        case when p_sort='created_desc' then m.created_at end desc,m.id desc) as _order from matched m
    ), page as (select * from ordered order by _order limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page)-'_order' order by _order) from page),'[]'::jsonb)) into v_result;
  end if;
  return v_result;
end;
$$;
revoke all on function public.admin_read_filtered(uuid,text,integer,integer,text,text,uuid,
  timestamptz,timestamptz,text,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_read_filtered(uuid,text,integer,integer,text,text,uuid,
  timestamptz,timestamptz,text,text,uuid,text,uuid) to service_role;
create index if not exists admin_audit_actor_time_idx on public.admin_audit_logs(admin_user_id,created_at desc,id desc);
create index if not exists admin_audit_action_time_idx on public.admin_audit_logs(action,created_at desc,id desc);
create index if not exists security_event_type_time_idx on public.security_events(event_type,created_at desc,id desc);
