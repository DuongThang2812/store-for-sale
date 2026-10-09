-- Detail metadata and related lists are bounded independently. No customer,
-- sale, debt, receipt or cost rows are exposed by these Admin reads.
create function public.admin_read_detail(
  p_actor_id uuid,p_resource text,p_target_id uuid,
  p_offset integer default 0,p_limit integer default 20,p_sort text default 'created_desc'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform public.require_active_platform_admin(p_actor_id);
  if p_target_id is null or p_resource is null or p_resource not in (
    'shop','user','shop_members','shop_activity','shop_security',
    'user_memberships','user_activity','user_security')
    or p_offset is null or p_offset not between 0 and 1000000
    or p_limit is null or p_limit not between 1 and 100
    or p_sort is null or p_sort not in ('created_desc','created_asc') then
    raise exception using errcode='22023',message='Thông tin chi tiết hoặc phân trang chưa hợp lệ.';
  end if;
  if (p_resource in ('shop','shop_members','shop_activity','shop_security')
    and not exists(select 1 from public.stores where id=p_target_id))
    or (p_resource in ('user','user_memberships','user_activity','user_security')
    and not exists(select 1 from public.profiles where id=p_target_id)) then return null; end if;
  if p_resource='shop' then
    select jsonb_build_object('id',s.id,'name',s.name,'business_type',s.business_type,
      'status',s.status,'created_at',s.created_at,'owner_id',s.created_by,
      'owner_name',p.display_name,'owner_email',u.email,
      'member_count',(select count(*) from public.store_members m where m.store_id=s.id and m.is_active),
      'product_count',(select count(*) from public.products x where x.store_id=s.id),
      'last_activity_at',(select max(a.created_at) from public.audit_logs a where a.store_id=s.id))
      into v_result from public.stores s left join public.profiles p on p.id=s.created_by
      left join auth.users u on u.id=s.created_by where s.id=p_target_id;
  elsif p_resource='user' then
    select jsonb_build_object('id',u.id,'email',u.email,'display_name',p.display_name,
      'account_status',p.account_status,'created_at',u.created_at,
      'membership_count',(select count(*) from public.store_members m where m.user_id=u.id and m.is_active))
      into v_result from auth.users u join public.profiles p on p.id=u.id where u.id=p_target_id;
  elsif p_resource='shop_members' then
    with matched as (
      select m.user_id as id,m.user_id,p.display_name,u.email,m.role,m.is_active,m.created_at,
        p.account_status,m.can_sell,m.can_receive_stock,m.can_manage_debt
      from public.store_members m join public.profiles p on p.id=m.user_id
        join auth.users u on u.id=m.user_id where m.store_id=p_target_id
    ), page as (select * from matched order by
      case when p_sort='created_asc' then created_at end asc,
      case when p_sort='created_desc' then created_at end desc,id desc limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page) order by
        case when p_sort='created_asc' then created_at end asc,
        case when p_sort='created_desc' then created_at end desc,id desc) from page),'[]'::jsonb)) into v_result;
  elsif p_resource='user_memberships' then
    with matched as (
      select m.store_id as id,m.store_id,s.name as store_name,s.business_type,s.status as store_status,
        m.role,m.is_active,m.created_at,m.can_sell,m.can_receive_stock,m.can_manage_debt
      from public.store_members m join public.stores s on s.id=m.store_id where m.user_id=p_target_id
    ), page as (select * from matched order by
      case when p_sort='created_asc' then created_at end asc,
      case when p_sort='created_desc' then created_at end desc,id desc limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page) order by
        case when p_sort='created_asc' then created_at end asc,
        case when p_sort='created_desc' then created_at end desc,id desc) from page),'[]'::jsonb)) into v_result;
  elsif p_resource in ('shop_activity','user_activity') then
    with matched as (
      select a.id,a.admin_user_id,p.display_name as admin_name,a.action,a.target_type,
        a.target_id,a.reason,a.created_at
      from public.admin_audit_logs a left join public.profiles p on p.id=a.admin_user_id
      where a.target_id=p_target_id and
        ((p_resource='shop_activity' and a.target_type='store')
          or (p_resource='user_activity' and a.target_type in ('user','platform_admin')))
    ), page as (select * from matched order by
      case when p_sort='created_asc' then created_at end asc,
      case when p_sort='created_desc' then created_at end desc,id desc limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page) order by
        case when p_sort='created_asc' then created_at end asc,
        case when p_sort='created_desc' then created_at end desc,id desc) from page),'[]'::jsonb)) into v_result;
  else
    with matched as (
      -- Return observed metadata only; no raw provider payload or arbitrary
      -- security event metadata is copied into detail pages.
      select e.id,e.event_type,e.user_id,p.display_name as user_name,e.created_at,
        jsonb_strip_nulls(jsonb_build_object('audit_id',e.metadata->>'audit_id',
          'target_type',e.metadata->>'target_type','target_id',e.metadata->>'target_id',
          'action',e.metadata->>'action','limit',e.metadata->>'limit')) as metadata
      from public.security_events e left join public.profiles p on p.id=e.user_id
      where (p_resource='user_security' and e.user_id=p_target_id)
        or (p_resource='shop_security' and e.metadata->>'target_id'=p_target_id::text
          and (e.metadata->>'target_type'='store' or e.metadata->>'action'='store_status'))
    ), page as (select * from matched order by
      case when p_sort='created_asc' then created_at end asc,
      case when p_sort='created_desc' then created_at end desc,id desc limit p_limit offset p_offset)
    select jsonb_build_object('total',(select count(*) from matched),
      'items',coalesce((select jsonb_agg(to_jsonb(page) order by
        case when p_sort='created_asc' then created_at end asc,
        case when p_sort='created_desc' then created_at end desc,id desc) from page),'[]'::jsonb)) into v_result;
  end if;
  return v_result;
end;
$$;
revoke all on function public.admin_read_detail(uuid,text,uuid,integer,integer,text) from public,anon,authenticated;
grant execute on function public.admin_read_detail(uuid,text,uuid,integer,integer,text) to service_role;
create index security_events_store_target_idx on public.security_events((metadata->>'target_id'),created_at desc,id desc)
  where metadata->>'target_type'='store' or metadata->>'action'='store_status';
