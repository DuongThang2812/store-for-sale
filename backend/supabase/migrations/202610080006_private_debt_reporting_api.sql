create role bin_debt_api noinherit nologin nobypassrls;
create role bin_reporting_api noinherit nologin nobypassrls;
grant bin_debt_api,bin_reporting_api to postgres;
create schema debt_api;
create schema reporting_api;
revoke all on schema debt_api,reporting_api from public,anon,authenticated;
create function debt_api.require_read(p_shop uuid)
returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  if not public.can_store_operation(p_shop,'manage_debt') then raise exception 'Debt permission required' using errcode='42501'; end if;
end $$;
create function debt_api.customers(p_shop uuid,p_options jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_limit integer:=coalesce((p_options->>'limit')::integer,30);v_offset integer:=coalesce((p_options->>'offset')::integer,0);
begin
  perform debt_api.require_read(p_shop);
  if v_limit not between 1 and 200 or v_offset not between 0 and 1000000 then raise exception 'Invalid pagination' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'shopId',store_id,'name',name,'phone',phone,'note',note,
    'totalDebt',current_debt,'isInDebtBook',is_in_debt_book,'lastTransactionAt',last_transaction_at,'openInvoiceCount',open_invoice_count) order by name,id),'[]'::jsonb)
    into v_result from (select * from public.customer_debt_summary where store_id=p_shop
      and (not coalesce((p_options->>'debtOnly')::boolean,false) or is_in_debt_book)
      and position(lower(coalesce(p_options->>'query','')) in lower(name))>0
      order by name,id offset v_offset limit v_limit)c;
  return v_result;
end $$;
create function debt_api.customer(p_shop uuid,p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  perform debt_api.require_read(p_shop);
  select jsonb_build_object('id',id,'shopId',store_id,'name',name,'phone',phone,'note',note,'totalDebt',current_debt,
    'isInDebtBook',is_in_debt_book,'lastTransactionAt',last_transaction_at,'openInvoiceCount',open_invoice_count)
    into v_result from public.customer_debt_summary where store_id=p_shop and id=p_customer;
  if v_result is null then raise exception 'Customer not found' using errcode='P0002'; end if;
  return v_result;
end $$;
create function debt_api.create_customer(p_shop uuid,p_request uuid,p_name text,p_phone text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_debt');
  return public.create_customer(p_shop,p_request,p_name,p_phone,p_note);
end $$;
create function debt_api.save_customer(p_shop uuid,p_customer uuid,p_name text,p_phone text,p_note text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_debt');
  return public.save_customer(p_shop,p_name,p_phone,p_note,p_customer);
end $$;
create function debt_api.pay(p_shop uuid,p_customer uuid,p_amount bigint,p_request uuid,p_method text,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  perform public.require_store_operation(p_shop,'manage_debt');
  return public.record_debt_payment(p_shop,p_customer,p_amount,p_request,p_method,p_note);
end $$;
create function reporting_api.dashboard(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  return public.shop_dashboard(p_shop);
end $$;
create function reporting_api.revenue(p_shop uuid,p_days integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform catalog_api.require_member(p_shop);
  return public.management_report(p_shop,p_days);
end $$;
revoke all on all functions in schema debt_api,reporting_api from public,anon,authenticated;
grant usage on schema debt_api to bin_debt_api;
grant execute on function debt_api.customers(uuid,jsonb),debt_api.customer(uuid,uuid),debt_api.create_customer(uuid,uuid,text,text,text),
 debt_api.save_customer(uuid,uuid,text,text,text),debt_api.pay(uuid,uuid,bigint,uuid,text,text) to bin_debt_api;
grant usage on schema reporting_api to bin_reporting_api;
grant execute on all functions in schema reporting_api to bin_reporting_api;
