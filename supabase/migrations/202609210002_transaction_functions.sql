-- Atomic commands for inventory, sales and debt. All functions use the signed-in user.

create or replace function public.receive_stock(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_receipt uuid;
  v_existing uuid;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric(14,3);
  v_base_numeric numeric;
  v_base_quantity bigint;
  v_unit_cost bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Danh sách nhập hàng phải có từ 1 đến 500 dòng.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select id into v_existing from public.stock_receipts where store_id = p_store_id and client_request_id = p_request_id;
  if v_existing is not null then return jsonb_build_object('receipt_id', v_existing, 'duplicate', true); end if;

  -- Lock products in a stable order to prevent overselling/deadlocks against other commands.
  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.stock_receipts (store_id, client_request_id, note, created_by)
  values (p_store_id, p_request_id, nullif(btrim(p_note), ''), v_user) returning id into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_unit_cost := (v_item ->> 'unit_cost')::bigint;
    exception when others then raise exception 'Số lượng hoặc giá nhập chưa hợp lệ.'; end;
    if v_quantity <= 0 or v_quantity > 999999 or v_unit_cost < 0 or v_unit_cost > 999999999 then raise exception 'Số lượng hoặc giá nhập vượt giới hạn.'; end if;

    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid and is_active for update;
    if not found then raise exception 'Không tìm thấy mặt hàng đang bán.'; end if;
    select * into v_unit from public.product_units
      where store_id = p_store_id and product_id = v_product.id and unit_key = (v_item ->> 'unit_key') and can_purchase;
    if not found then raise exception 'Đơn vị nhập của % chưa hợp lệ.', v_product.name; end if;

    v_base_numeric := v_quantity * v_unit.factor_to_base;
    if v_base_numeric <> trunc(v_base_numeric) then raise exception 'Số lượng % chưa quy đổi thành đơn vị kho nguyên.', v_product.name; end if;
    v_base_quantity := v_base_numeric::bigint;
    v_line_total := round(v_quantity * v_unit_cost)::bigint;

    begin
      insert into public.stock_receipt_items (store_id, receipt_id, product_id, unit_key, unit_name, quantity, factor_to_base, base_quantity, unit_cost, line_total)
      values (p_store_id, v_receipt, v_product.id, v_unit.unit_key, v_unit.unit_name, v_quantity, v_unit.factor_to_base, v_base_quantity, v_unit_cost, v_line_total);
    exception when unique_violation then raise exception 'Một mặt hàng và đơn vị chỉ được xuất hiện một lần trong phiếu nhập.'; end;

    update public.products set stock_base = stock_base + v_base_quantity, version = version + 1 where id = v_product.id returning stock_base into v_product.stock_base;
    update public.product_units set purchase_price = v_unit_cost where id = v_unit.id;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, receipt_id, created_by)
    values (p_store_id, v_product.id, 'purchase', v_base_quantity, v_product.stock_base, v_receipt, v_user);
    v_total := v_total + v_line_total;
  end loop;

  update public.stock_receipts set total_cost = v_total where id = v_receipt;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.received', 'stock_receipt', v_receipt, jsonb_build_object('total_cost', v_total, 'line_count', jsonb_array_length(p_items)));
  return jsonb_build_object('receipt_id', v_receipt, 'total_cost', v_total, 'duplicate', false);
end;
$$;

create or replace function public.create_sale(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_payment_type text default 'cash',
  p_customer_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sale uuid;
  v_existing public.sales%rowtype;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity bigint;
  v_base_quantity bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_payment_type not in ('cash', 'credit') then raise exception 'Hình thức thanh toán chưa hợp lệ.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Giỏ hàng phải có từ 1 đến 200 dòng.'; end if;
  if p_payment_type = 'credit' then
    perform 1 from public.customers where store_id = p_store_id and id = p_customer_id for update;
    if not found then raise exception 'Không tìm thấy khách mua chịu.'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.sales where store_id = p_store_id and client_request_id = p_request_id;
  if found then return jsonb_build_object('sale_id', v_existing.id, 'total_amount', v_existing.total_amount, 'duplicate', true); end if;

  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.sales (store_id, customer_id, payment_type, client_request_id, created_by)
  values (p_store_id, case when p_payment_type = 'credit' then p_customer_id else null end, p_payment_type, p_request_id, v_user)
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_quantity := (v_item ->> 'quantity')::bigint;
    exception when others then raise exception 'Số lượng bán chưa hợp lệ.'; end;
    if v_quantity <= 0 or v_quantity > 999999 then raise exception 'Số lượng bán phải lớn hơn 0.'; end if;

    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid and is_active for update;
    if not found then raise exception 'Không tìm thấy mặt hàng đang bán.'; end if;
    select * into v_unit from public.product_units
      where store_id = p_store_id and product_id = v_product.id and unit_key = (v_item ->> 'unit_key') and can_sell;
    if not found then raise exception 'Đơn vị bán của % chưa hợp lệ.', v_product.name; end if;

    v_base_quantity := v_quantity * v_unit.factor_to_base;
    if v_product.stock_base < v_base_quantity then raise exception 'Không đủ hàng % trong kho.', v_product.name; end if;
    v_line_total := v_quantity * v_unit.sale_price;

    begin
      insert into public.sale_items (store_id, sale_id, product_id, product_name, unit_key, unit_name, quantity, factor_to_base, base_quantity, unit_price, line_total)
      values (p_store_id, v_sale, v_product.id, v_product.name, v_unit.unit_key, v_unit.unit_name, v_quantity, v_unit.factor_to_base, v_base_quantity, v_unit.sale_price, v_line_total);
    exception when unique_violation then raise exception 'Một mặt hàng và đơn vị chỉ được xuất hiện một lần trong giỏ.'; end;

    update public.products set stock_base = stock_base - v_base_quantity, version = version + 1 where id = v_product.id returning stock_base into v_product.stock_base;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, sale_id, created_by)
    values (p_store_id, v_product.id, 'sale', -v_base_quantity, v_product.stock_base, v_sale, v_user);
    v_total := v_total + v_line_total;
  end loop;

  update public.sales set total_amount = v_total, outstanding_amount = case when p_payment_type = 'credit' then v_total else 0 end where id = v_sale;
  if p_payment_type = 'credit' then
    update public.customers set current_debt = current_debt + v_total, is_in_debt_book = true, last_transaction_at = now() where id = p_customer_id;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'sale.created', 'sale', v_sale, jsonb_build_object('payment_type', p_payment_type, 'total_amount', v_total));
  return jsonb_build_object('sale_id', v_sale, 'total_amount', v_total, 'duplicate', false);
end;
$$;

create or replace function public.record_debt_payment(
  p_store_id uuid,
  p_customer_id uuid,
  p_amount bigint,
  p_request_id uuid,
  p_payment_method text default 'cash',
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payment uuid;
  v_existing public.debt_payments%rowtype;
  v_customer public.customers%rowtype;
  v_sale public.sales%rowtype;
  v_remaining bigint := p_amount;
  v_applied bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Số tiền trả phải lớn hơn 0.'; end if;
  if p_payment_method not in ('cash', 'bank', 'other') then raise exception 'Cách nhận tiền chưa hợp lệ.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.debt_payments where store_id = p_store_id and client_request_id = p_request_id;
  if found then return jsonb_build_object('payment_id', v_existing.id, 'remaining_debt', (select current_debt from public.customers where id = v_existing.customer_id), 'duplicate', true); end if;

  select * into v_customer from public.customers where store_id = p_store_id and id = p_customer_id for update;
  if not found then raise exception 'Không tìm thấy khách.'; end if;
  if p_amount > v_customer.current_debt then raise exception 'Số tiền trả vượt quá số nợ hiện tại.'; end if;

  insert into public.debt_payments (store_id, customer_id, amount, payment_method, note, client_request_id, created_by)
  values (p_store_id, p_customer_id, p_amount, p_payment_method, nullif(btrim(p_note), ''), p_request_id, v_user) returning id into v_payment;

  for v_sale in select * from public.sales
    where store_id = p_store_id and customer_id = p_customer_id and payment_type = 'credit' and status = 'completed' and outstanding_amount > 0
    order by created_at, id for update
  loop
    exit when v_remaining = 0;
    v_applied := least(v_remaining, v_sale.outstanding_amount);
    insert into public.payment_allocations (payment_id, sale_id, store_id, amount) values (v_payment, v_sale.id, p_store_id, v_applied);
    update public.sales set outstanding_amount = outstanding_amount - v_applied where id = v_sale.id;
    v_remaining := v_remaining - v_applied;
  end loop;
  if v_remaining <> 0 then raise exception 'Lịch sử nợ chưa khớp số dư khách.'; end if;

  update public.customers
    set current_debt = current_debt - p_amount, is_in_debt_book = (current_debt - p_amount > 0), last_transaction_at = now()
    where id = p_customer_id returning * into v_customer;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'debt.payment_recorded', 'debt_payment', v_payment, jsonb_build_object('amount', p_amount, 'remaining_debt', v_customer.current_debt));
  return jsonb_build_object('payment_id', v_payment, 'remaining_debt', v_customer.current_debt, 'duplicate', false);
end;
$$;

create or replace function public.cancel_sale(
  p_store_id uuid,
  p_sale_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_balance bigint;
  v_refund bigint;
  v_debt_reduction bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 300 then raise exception 'Lý do hủy phải có từ 1 đến 300 ký tự.'; end if;
  select * into v_sale from public.sales where store_id = p_store_id and id = p_sale_id;
  if not found then raise exception 'Không tìm thấy đơn bán hàng.'; end if;
  if v_sale.customer_id is not null then
    perform 1 from public.customers where id = v_sale.customer_id and store_id = p_store_id for update;
  end if;
  -- Payments also lock customer before sale rows. Keep the same order to avoid deadlocks.
  select * into v_sale from public.sales where store_id = p_store_id and id = p_sale_id for update;
  if v_sale.status = 'cancelled' then raise exception 'Đơn này đã hủy.'; end if;
  if not exists (select 1 from public.sale_items where sale_id = p_sale_id) then raise exception 'Đơn không có chi tiết mặt hàng để hoàn kho.'; end if;

  v_debt_reduction := case when v_sale.payment_type = 'credit' then v_sale.outstanding_amount else 0 end;
  v_refund := v_sale.total_amount - v_debt_reduction;

  if v_sale.customer_id is not null then
    if v_debt_reduction > 0 then
      update public.customers
        set current_debt = current_debt - v_debt_reduction,
            is_in_debt_book = (current_debt - v_debt_reduction > 0), last_transaction_at = now()
        where id = v_sale.customer_id and current_debt >= v_debt_reduction;
      if not found then raise exception 'Số dư nợ của khách không khớp lịch sử.'; end if;
    end if;
  end if;

  for v_item in select * from public.sale_items where sale_id = p_sale_id order by product_id for update loop
    update public.products set stock_base = stock_base + v_item.base_quantity, version = version + 1
      where id = v_item.product_id and store_id = p_store_id returning stock_base into v_balance;
    if not found then raise exception 'Không tìm thấy mặt hàng để hoàn kho.'; end if;
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, sale_id, reason, created_by)
    values (p_store_id, v_item.product_id, 'sale_cancel', v_item.base_quantity, v_balance, p_sale_id, btrim(p_reason), v_user);
  end loop;

  update public.sales set status = 'cancelled', outstanding_amount = 0, cancelled_at = now(), cancellation_reason = btrim(p_reason), refund_amount = v_refund, debt_reduction = v_debt_reduction where id = p_sale_id;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'sale.cancelled', 'sale', p_sale_id, jsonb_build_object('reason', btrim(p_reason), 'refund_amount', v_refund, 'debt_reduction', v_debt_reduction));
  return jsonb_build_object('sale_id', p_sale_id, 'refund_amount', v_refund, 'debt_reduction', v_debt_reduction);
end;
$$;

revoke all on function public.receive_stock(uuid, uuid, jsonb, text), public.create_sale(uuid, uuid, jsonb, text, uuid),
  public.record_debt_payment(uuid, uuid, bigint, uuid, text, text), public.cancel_sale(uuid, uuid, text) from public, anon;
grant execute on function public.receive_stock(uuid, uuid, jsonb, text), public.create_sale(uuid, uuid, jsonb, text, uuid),
  public.record_debt_payment(uuid, uuid, bigint, uuid, text, text), public.cancel_sale(uuid, uuid, text) to authenticated;

create view public.product_catalog with (security_invoker = true) as
select p.id, p.store_id, p.name, p.category, p.product_group, p.base_unit, p.stock_base,
  p.low_stock_threshold, p.is_active, p.version, p.created_at, p.updated_at,
  coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'key', u.unit_key, 'name', u.unit_name, 'factor', u.factor_to_base,
    'purchase_price', u.purchase_price, 'sale_price', u.sale_price,
    'can_purchase', u.can_purchase, 'can_sell', u.can_sell
  ) order by u.factor_to_base) filter (where u.id is not null), '[]'::jsonb) units
from public.products p left join public.product_units u on u.product_id = p.id and u.store_id = p.store_id
group by p.id;

create view public.customer_debt_summary with (security_invoker = true) as
select c.id, c.store_id, c.name, c.phone, c.note, c.current_debt, c.is_in_debt_book,
  c.last_transaction_at, count(s.id) filter (where s.status = 'completed' and s.outstanding_amount > 0) open_invoice_count
from public.customers c left join public.sales s on s.customer_id = c.id and s.store_id = c.store_id
group by c.id;

grant select on public.product_catalog, public.customer_debt_summary to authenticated;
