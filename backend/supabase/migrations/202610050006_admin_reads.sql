-- The server role receives only the metadata reads needed by the Admin API.
-- All shop business details stay behind their own owner/member policies.
grant select on public.platform_admins, public.admin_audit_logs,
  public.security_events, public.profiles, public.stores, public.store_members
  to service_role;

create or replace function public.admin_read(
  p_actor_id uuid, p_resource text,
  p_offset integer default 0, p_limit integer default 20,
  p_query text default null, p_filter text default null,
  p_target_id uuid default null,
  p_from timestamptz default null, p_to timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_query text := nullif(btrim(p_query), '');
begin
  perform public.require_active_platform_admin(p_actor_id);
  if p_resource not in ('dashboard', 'shops', 'shop', 'users', 'user',
    'admins', 'audit', 'security', 'system') then
    raise exception 'Tài nguyên quản trị không hợp lệ.';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 1000000
    or p_limit is null or p_limit not between 1 and 100
    or char_length(coalesce(v_query, '')) > 120
    or char_length(coalesce(p_filter, '')) > 80
    or (p_from is not null and p_to is not null and p_from > p_to) then
    raise exception 'Bộ lọc hoặc phân trang chưa hợp lệ.';
  end if;

  if p_resource = 'dashboard' then
    select jsonb_build_object(
      'total_shops', (select count(*) from public.stores),
      'active_shops', (select count(*) from public.stores where status = 'active'),
      'suspended_shops', (select count(*) from public.stores where status = 'suspended'),
      'archived_shops', (select count(*) from public.stores where status = 'archived'),
      'total_users', (select count(*) from public.profiles),
      'disabled_users', (select count(*) from public.profiles where account_status = 'disabled'),
      'active_admins', (select count(*) from public.platform_admins where is_active),
      'new_shops_7d', (select count(*) from public.stores where created_at >= now() - interval '7 days'),
      'new_users_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'grocery_shops', (select count(*) from public.stores where business_type = 'grocery'),
      'fruit_shops', (select count(*) from public.stores where business_type = 'fruit_shop'),
      'admin_actions_today', (select count(*) from public.admin_audit_logs
        where created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
          at time zone 'Asia/Ho_Chi_Minh'),
      'recent_actions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
        from (select id, action, target_type, target_id, created_at
          from public.admin_audit_logs order by created_at desc, id desc limit 5) x),
      'recent_security_events', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
        from (select id, event_type, user_id, created_at
          from public.security_events order by created_at desc, id desc limit 5) x)
    ) into v_result;

  elsif p_resource = 'shops' then
    with matched as (
      select s.id, s.name, s.business_type, s.status, s.created_at, s.created_by,
        p.display_name as owner_name
      from public.stores s left join public.profiles p on p.id = s.created_by
      where (v_query is null or s.name ilike '%' || v_query || '%'
        or p.display_name ilike '%' || v_query || '%')
        and (p_filter is null or p_filter = 'all'
          or p_filter = s.status or p_filter = s.business_type)
    ), page as (
      select m.*, (select count(*) from public.store_members sm
          where sm.store_id = m.id and sm.is_active) as member_count,
        (select count(*) from public.products p where p.store_id = m.id) as product_count,
        (select max(a.created_at) from public.audit_logs a
          where a.store_id = m.id) as last_activity_at
      from matched m order by m.created_at desc, m.id desc limit p_limit offset p_offset
    )
    select jsonb_build_object('total', (select count(*) from matched),
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc)
        from page), '[]'::jsonb)) into v_result;

  elsif p_resource = 'shop' then
    if p_target_id is null then raise exception 'Thiếu cửa hàng.'; end if;
    select jsonb_build_object(
      'id', s.id, 'name', s.name, 'business_type', s.business_type,
      'status', s.status, 'created_at', s.created_at,
      'owner_id', s.created_by, 'owner_name', p.display_name,
      'member_count', (select count(*) from public.store_members m
        where m.store_id = s.id and m.is_active),
      'product_count', (select count(*) from public.products x where x.store_id = s.id),
      'last_activity_at', (select max(a.created_at) from public.audit_logs a
        where a.store_id = s.id),
      'admin_actions', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) from
        (select id, admin_user_id, action, reason, before_data, after_data, created_at
          from public.admin_audit_logs where target_type = 'store' and target_id = s.id
          order by created_at desc, id desc limit 20) a)
    ) into v_result
    from public.stores s left join public.profiles p on p.id = s.created_by
    where s.id = p_target_id;

  elsif p_resource = 'users' then
    with matched as (
      select u.id, u.email, u.created_at, p.display_name, p.account_status
      from auth.users u join public.profiles p on p.id = u.id
      where (v_query is null or p.display_name ilike '%' || v_query || '%'
        or u.email ilike '%' || v_query || '%')
        and (p_filter is null or p_filter = 'all'
          or p_filter = p.account_status
          or exists (select 1 from public.store_members m
            where m.user_id = u.id and m.role = p_filter and m.is_active))
    ), page as (
      select m.*, (select count(*) from public.store_members sm
          where sm.user_id = m.id and sm.is_active) as shop_count,
        (select coalesce(jsonb_agg(distinct sm.role), '[]'::jsonb)
          from public.store_members sm where sm.user_id = m.id and sm.is_active) as roles
      from matched m order by m.created_at desc, m.id desc limit p_limit offset p_offset
    )
    select jsonb_build_object('total', (select count(*) from matched),
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc)
        from page), '[]'::jsonb)) into v_result;

  elsif p_resource = 'user' then
    if p_target_id is null then raise exception 'Thiếu tài khoản.'; end if;
    select jsonb_build_object('id', u.id, 'email', u.email,
      'display_name', p.display_name, 'account_status', p.account_status,
      'created_at', u.created_at,
      'memberships', (select coalesce(jsonb_agg(jsonb_build_object(
        'store_id', m.store_id, 'store_name', s.name, 'role', m.role,
        'is_active', m.is_active) order by s.name), '[]'::jsonb)
        from public.store_members m join public.stores s on s.id = m.store_id
        where m.user_id = u.id),
      'security_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
        from (select id, event_type, created_at from public.security_events
          where user_id = u.id order by created_at desc, id desc limit 20) e),
      'admin_actions', (select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
        from (select id, action, reason, created_at from public.admin_audit_logs
          where target_id = u.id order by created_at desc, id desc limit 20) a)
    ) into v_result from auth.users u join public.profiles p on p.id = u.id
    where u.id = p_target_id;

  elsif p_resource = 'admins' then
    with matched as (
      select a.id, a.user_id, a.admin_role, a.is_active, a.created_at,
        p.display_name, u.email from public.platform_admins a
      join public.profiles p on p.id = a.user_id
      join auth.users u on u.id = a.user_id
      where v_query is null or p.display_name ilike '%' || v_query || '%'
        or u.email ilike '%' || v_query || '%'
    ), page as (
      select * from matched order by created_at desc, id desc limit p_limit offset p_offset
    )
    select jsonb_build_object('total', (select count(*) from matched),
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc)
        from page), '[]'::jsonb)) into v_result;

  elsif p_resource = 'audit' then
    with matched as (
      select id, admin_user_id, action, target_type, target_id, reason,
        before_data, after_data, metadata, created_at
      from public.admin_audit_logs
      where (v_query is null or action ilike '%' || v_query || '%'
        or reason ilike '%' || v_query || '%')
        and (p_filter is null or p_filter = 'all'
          or action = p_filter or target_type = p_filter)
        and (p_from is null or created_at >= p_from)
        and (p_to is null or created_at < p_to)
    ), page as (
      select * from matched order by created_at desc, id desc limit p_limit offset p_offset
    )
    select jsonb_build_object('total', (select count(*) from matched),
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc)
        from page), '[]'::jsonb)) into v_result;

  elsif p_resource = 'security' then
    with matched as (
      select id, event_type, user_id, metadata, created_at
      from public.security_events
      where (v_query is null or event_type ilike '%' || v_query || '%')
        and (p_filter is null or p_filter = 'all' or event_type = p_filter)
        and (p_from is null or created_at >= p_from)
        and (p_to is null or created_at < p_to)
    ), page as (
      select * from matched order by created_at desc, id desc limit p_limit offset p_offset
    )
    select jsonb_build_object('total', (select count(*) from matched),
      'items', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc, id desc)
        from page), '[]'::jsonb)) into v_result;

  else -- system: only values actually measured by PostgreSQL.
    select jsonb_build_object('database_ok', true, 'checked_at', now(),
      'total_shops', (select count(*) from public.stores),
      'total_users', (select count(*) from public.profiles),
      'total_products', (select count(*) from public.products),
      'total_sales_records', (select count(*) from public.sales)) into v_result;
  end if;
  return v_result;
end;
$$;
revoke all on function public.admin_read(uuid, text, integer, integer, text,
  text, uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_read(uuid, text, integer, integer, text,
  text, uuid, timestamptz, timestamptz) to service_role;
