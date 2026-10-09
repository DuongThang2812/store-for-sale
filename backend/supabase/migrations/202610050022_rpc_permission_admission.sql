-- Admit business RPCs before their idempotent result or any write.
-- Existing role/auth checks and transaction algorithms are preserved.

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
  v_existing public.stock_receipts%rowtype;
  v_hash text;
  v_total bigint := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_unit public.product_units%rowtype;
  v_quantity numeric;
  v_base_numeric numeric;
  v_base_quantity bigint;
  v_unit_cost bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'receive_stock');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Danh sách nhập hàng phải có từ 1 đến 500 dòng.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_receipts where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho phiếu nhập khác.';
    end if;
    return jsonb_build_object('receipt_id', v_existing.id, 'duplicate', true);
  end if;

  -- Lock products in a stable order to prevent overselling/deadlocks against other commands.
  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.stock_receipts (store_id, client_request_id, note, created_by, request_hash)
  values (p_store_id, p_request_id, nullif(btrim(p_note), ''), v_user, v_hash) returning id into v_receipt;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_unit_cost := (v_item ->> 'unit_cost')::bigint;
    exception when others then raise exception 'Số lượng hoặc giá nhập chưa hợp lệ.'; end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999
      or v_quantity <> trunc(v_quantity, 3)
      or v_unit_cost is null or v_unit_cost < 0 or v_unit_cost > 999999999 then raise exception 'Số lượng hoặc giá nhập vượt giới hạn.'; end if;

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
  v_quantity numeric;
  v_base_numeric numeric;
  v_hash text;
  v_base_quantity bigint;
  v_line_total bigint;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'sell');
  if p_payment_type='credit' then perform public.require_store_operation(p_store_id,'manage_debt'); end if;
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_payment_type not in ('cash', 'credit') then raise exception 'Hình thức thanh toán chưa hợp lệ.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Giỏ hàng phải có từ 1 đến 200 dòng.'; end if;
  if p_payment_type = 'credit' then
    perform 1 from public.customers where store_id = p_store_id and id = p_customer_id for update;
    if not found then raise exception 'Không tìm thấy khách mua chịu.'; end if;
  end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'payment_type', p_payment_type, 'customer_id', p_customer_id
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.sales where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho đơn bán khác.';
    end if;
    return jsonb_build_object('sale_id', v_existing.id, 'total_amount', v_existing.total_amount, 'duplicate', true);
  end if;

  perform p.id from public.products p
  where p.store_id = p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text
  ) order by p.id for update;

  insert into public.sales (store_id, customer_id, payment_type, client_request_id, created_by, request_hash)
  values (p_store_id, case when p_payment_type = 'credit' then p_customer_id else null end, p_payment_type, p_request_id, v_user, v_hash)
  returning id into v_sale;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_quantity := (v_item ->> 'quantity')::numeric;
    exception when others then raise exception 'Số lượng bán chưa hợp lệ.'; end;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 999999 or v_quantity <> trunc(v_quantity, 3) then
      raise exception 'Số lượng bán phải lớn hơn 0 và tối đa 3 số lẻ.';
    end if;

    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid and is_active for update;
    if not found then raise exception 'Không tìm thấy mặt hàng đang bán.'; end if;
    select * into v_unit from public.product_units
      where store_id = p_store_id and product_id = v_product.id and unit_key = (v_item ->> 'unit_key') and can_sell;
    if not found then raise exception 'Đơn vị bán của % chưa hợp lệ.', v_product.name; end if;

    v_base_numeric := v_quantity * v_unit.factor_to_base;
    if v_base_numeric <> trunc(v_base_numeric) then
      raise exception 'Số lượng % chưa quy đổi thành đơn vị kho nguyên.', v_product.name;
    end if;
    v_base_quantity := v_base_numeric::bigint;
    if v_product.stock_base < v_base_quantity then raise exception 'Không đủ hàng % trong kho.', v_product.name; end if;
    v_line_total := round(v_quantity * v_unit.sale_price)::bigint;

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
  v_hash text;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'manage_debt');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Số tiền trả phải lớn hơn 0.'; end if;
  if p_payment_method not in ('cash', 'bank', 'other') then raise exception 'Cách nhận tiền chưa hợp lệ.'; end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'customer_id', p_customer_id, 'amount', p_amount,
    'payment_method', p_payment_method, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.debt_payments where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash is null then
      raise exception 'Mã yêu cầu cũ không thể xác minh. Vui lòng tạo yêu cầu mới.';
    end if;
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho khoản trả nợ khác.';
    end if;
    return jsonb_build_object('payment_id', v_existing.id,
      'remaining_debt', (select current_debt from public.customers where id = v_existing.customer_id), 'duplicate', true);
  end if;

  select * into v_customer from public.customers where store_id = p_store_id and id = p_customer_id for update;
  if not found then raise exception 'Không tìm thấy khách.'; end if;
  if p_amount > v_customer.current_debt then raise exception 'Số tiền trả vượt quá số nợ hiện tại.'; end if;

  insert into public.debt_payments (store_id, customer_id, amount, payment_method, note, client_request_id, created_by, request_hash)
  values (p_store_id, p_customer_id, p_amount, p_payment_method, nullif(btrim(p_note), ''), p_request_id, v_user, v_hash) returning id into v_payment;

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
  if v_user is null or not public.is_store_owner(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
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

create or replace function public.save_customer(
  p_store_id uuid,
  p_name text,
  p_phone text default null,
  p_note text default null,
  p_customer_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'manage_debt');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Tên khách chưa hợp lệ.'; end if;
  if char_length(coalesce(p_phone, '')) > 30 or char_length(coalesce(p_note, '')) > 500 then raise exception 'Điện thoại hoặc ghi chú quá dài.'; end if;
  if p_customer_id is null then
    insert into public.customers (store_id, name, phone, note)
    values (p_store_id, btrim(p_name), nullif(btrim(p_phone), ''), nullif(btrim(p_note), '')) returning id into v_id;
  else
    update public.customers set name = btrim(p_name), phone = nullif(btrim(p_phone), ''), note = nullif(btrim(p_note), '')
    where id = p_customer_id and store_id = p_store_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy khách.'; end if;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user, case when p_customer_id is null then 'customer.created' else 'customer.updated' end, 'customer', v_id);
  return v_id;
end;
$$;

create or replace function public.save_product(
  p_store_id uuid,
  p_name text,
  p_category text,
  p_product_group text,
  p_base_unit text,
  p_units jsonb,
  p_opening_stock bigint default 0,
  p_low_stock_threshold bigint default 5,
  p_is_active boolean default true,
  p_product_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_old public.products%rowtype;
  v_unit jsonb;
  v_key text;
  v_name text;
  v_factor bigint;
  v_purchase bigint;
  v_sale bigint;
  v_can_purchase boolean;
  v_can_sell boolean;
  v_category_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80 then raise exception 'Tên hoặc nhóm hiển thị chưa hợp lệ.'; end if;
  if p_product_group is null or p_product_group not in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'fruit', 'other') then raise exception 'Nhóm hàng chưa hợp lệ.'; end if;
  if p_base_unit is null or p_base_unit not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi') then raise exception 'Đơn vị tồn kho chưa hợp lệ.'; end if;
  if p_opening_stock < 0 or p_low_stock_threshold < 0 then raise exception 'Số lượng không được âm.'; end if;
  if p_units is null or jsonb_typeof(p_units) <> 'array' then raise exception 'Danh sách đơn vị chưa hợp lệ.'; end if;
  if jsonb_array_length(p_units) not between 1 and 8 then raise exception 'Mặt hàng cần từ 1 đến 8 đơn vị.'; end if;
  if p_product_group = 'fruit' and exists (
    select 1 from jsonb_array_elements(p_units) u
    where u.value ->> 'name' in ('kg', 'gram', 'lạng')
  ) and p_base_unit <> 'gram' then
    raise exception 'Trái cây bán theo cân phải dùng gram làm đơn vị tồn kho.';
  end if;
  if (select count(*) from (select distinct value ->> 'key' from jsonb_array_elements(p_units)) x) <> jsonb_array_length(p_units) then raise exception 'Đơn vị bị trùng.'; end if;
  if not exists (select 1 from jsonb_array_elements(p_units) where value ->> 'key' = 'base') then raise exception 'Thiếu đơn vị gốc.'; end if;
  select id into v_category_id from public.categories
    where store_id = p_store_id and lower(btrim(name)) = lower(btrim(p_category)) limit 1;

  if p_product_id is null then
    insert into public.products (store_id, name, category, category_id, product_group, base_unit, stock_base, low_stock_threshold, is_active)
    values (p_store_id, btrim(p_name), btrim(p_category), v_category_id, p_product_group, p_base_unit, p_opening_stock, p_low_stock_threshold, p_is_active)
    returning id into v_id;
  else
    select * into v_old from public.products where store_id = p_store_id and id = p_product_id for update;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if v_old.stock_base > 0 and v_old.base_unit <> p_base_unit then raise exception 'Mặt hàng còn tồn kho nên chưa thể đổi đơn vị nhỏ nhất.'; end if;
    v_id := v_old.id;
    update public.products set name = btrim(p_name), category = btrim(p_category), category_id = v_category_id, product_group = p_product_group,
      base_unit = p_base_unit, low_stock_threshold = p_low_stock_threshold, is_active = p_is_active, version = version + 1
    where id = v_id;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units) loop
    begin
      v_key := v_unit ->> 'key'; v_name := v_unit ->> 'name'; v_factor := (v_unit ->> 'factor')::bigint;
      v_purchase := nullif(v_unit ->> 'purchase_price', '')::bigint; v_sale := nullif(v_unit ->> 'sale_price', '')::bigint;
      v_can_purchase := coalesce((v_unit ->> 'can_purchase')::boolean, false); v_can_sell := coalesce((v_unit ->> 'can_sell')::boolean, false);
    exception when others then raise exception 'Thông tin đơn vị chưa hợp lệ.'; end;
    if v_key is null or v_key !~ '^[a-z][a-z0-9_]{0,23}$' or v_name not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi') or v_factor <= 0 then raise exception 'Tên hoặc hệ số đơn vị chưa hợp lệ.'; end if;
    if p_product_group = 'fruit' and (
      (v_name = 'kg' and v_factor <> 1000)
      or (v_name = 'lạng' and v_factor <> 100)
      or (v_name = 'gram' and v_factor <> 1)
    ) then raise exception 'Quy đổi kg, lạng, gram chưa chính xác.'; end if;
    if (v_purchase is not null and v_purchase not between 0 and 999999999) or (v_sale is not null and v_sale not between 0 and 999999999) then raise exception 'Giá vượt giới hạn.'; end if;
    if (v_can_purchase and v_purchase is null) or (v_can_sell and v_sale is null) or (not (v_can_purchase or v_can_sell) and (p_product_group <> 'fruit' or v_key <> 'base')) then
      raise exception 'Mỗi đơn vị giao dịch cần giá phù hợp; gram gốc có thể chỉ dùng để đo tồn kho.';
    end if;

    if p_product_id is not null and v_old.stock_base > 0 and exists (
      select 1 from public.product_units where store_id = p_store_id and product_id = v_id and unit_key = v_key
        and (factor_to_base <> v_factor or unit_name <> v_name)
    ) then raise exception 'Mặt hàng còn tồn kho nên chưa thể đổi quy cách.'; end if;

    insert into public.product_units (store_id, product_id, unit_key, unit_name, factor_to_base, purchase_price, sale_price, can_purchase, can_sell)
    values (p_store_id, v_id, v_key, v_name, v_factor, v_purchase, v_sale, v_can_purchase, v_can_sell)
    on conflict (store_id, product_id, unit_key) do update set unit_name = excluded.unit_name, factor_to_base = excluded.factor_to_base,
      purchase_price = excluded.purchase_price, sale_price = excluded.sale_price, can_purchase = excluded.can_purchase, can_sell = excluded.can_sell;
  end loop;

  if p_product_id is not null and v_old.stock_base > 0 and exists (
    select 1 from public.product_units u where u.store_id = p_store_id and u.product_id = v_id
      and not exists (select 1 from jsonb_array_elements(p_units) x where x.value ->> 'key' = u.unit_key)
  ) then raise exception 'Mặt hàng còn tồn kho nên chưa thể bỏ quy cách.'; end if;
  delete from public.product_units u where u.store_id = p_store_id and u.product_id = v_id
    and not exists (select 1 from jsonb_array_elements(p_units) x where x.value ->> 'key' = u.unit_key);

  if p_product_group = 'fruit' and p_is_active and not exists (
    select 1 from public.product_units
    where store_id = p_store_id and product_id = v_id and can_sell and sale_price > 0
  ) then raise exception 'Trái cây đang bán cần ít nhất một đơn vị có giá bán.'; end if;

  if p_product_id is null and p_opening_stock > 0 then
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, reason, created_by)
    values (p_store_id, v_id, 'opening', p_opening_stock, p_opening_stock, 'Tồn kho ban đầu', v_user);
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user, case when p_product_id is null then 'product.created' else 'product.updated' end, 'product', v_id);
  return v_id;
end;
$$;

create or replace function public.import_catalog_drafts(
  p_store_id uuid,
  p_request_id uuid,
  p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row jsonb;
  v_source text;
  v_name text;
  v_category text;
  v_group text;
  v_unit text;
  v_cost bigint;
  v_sale bigint;
  v_product uuid;
  v_result jsonb;
  v_created integer := 0;
  v_existing integer := 0;
  v_quoted integer := 0;
  v_skipped integer := 0;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được nhập danh mục vào DB.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null then raise exception 'Thiếu mã lần nhập.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'File cần từ 1 đến 2.000 dòng mặt hàng.';
  end if;
  if (select count(distinct value ->> 'source_id') from jsonb_array_elements(p_rows)) <> jsonb_array_length(p_rows) then
    raise exception 'Mã nguồn trong file bị thiếu hoặc trùng.';
  end if;

  -- Serialize imports in the same store. A retry with the same request ID returns the first result.
  perform 1 from public.stores where id = p_store_id for update;
  select result into v_result from public.catalog_import_batches
    where store_id = p_store_id and request_id = p_request_id;
  if found then return v_result; end if;
  insert into public.catalog_import_batches (store_id, request_id, imported_by)
  values (p_store_id, p_request_id, v_user);

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Một dòng hàng trong file chưa hợp lệ.'; end if;
    v_source := btrim(coalesce(v_row ->> 'source_id', ''));
    v_name := btrim(coalesce(v_row ->> 'name', ''));
    v_category := btrim(coalesce(v_row ->> 'category', ''));
    v_group := v_row ->> 'product_group';
    v_unit := v_row ->> 'base_unit';
    if v_source !~ '^[A-Za-z0-9_-]{1,40}$' or char_length(v_name) not between 1 and 120
      or char_length(v_category) not between 1 and 80
      or v_group not in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'other')
      or v_unit not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên') then
      raise exception 'Mã nguồn, tên, nhóm hoặc đơn vị mặt hàng chưa hợp lệ: %.', v_source;
    end if;
    if v_row ->> 'purchase_price' is not null and (v_row ->> 'purchase_price') !~ '^[0-9]{1,9}$' then
      raise exception 'Giá nhập tham khảo chưa hợp lệ: %.', v_source;
    end if;
    if v_row ->> 'sale_price' is not null and (v_row ->> 'sale_price') !~ '^[0-9]{1,9}$' then
      raise exception 'Giá bán lẻ chưa hợp lệ: %.', v_source;
    end if;
    v_cost := (v_row ->> 'purchase_price')::bigint;
    v_sale := (v_row ->> 'sale_price')::bigint;
    if char_length(coalesce(v_row ->> 'original_price', '')) > 500
      or char_length(coalesce(v_row ->> 'purchase_unit', '')) > 40
      or char_length(coalesce(v_row ->> 'tiers', '')) > 1000
      or char_length(coalesce(v_row ->> 'availability', '')) > 100
      or char_length(coalesce(v_row ->> 'review_note', '')) > 1000
      or char_length(coalesce(v_row ->> 'original_line', '')) > 2000 then
      raise exception 'Dòng nguồn quá dài: %.', v_source;
    end if;

    if exists (select 1 from public.product_source_quotes where store_id = p_store_id and source_id = v_source) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select id into v_product from public.products
      where store_id = p_store_id
        and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
      order by is_active desc, id limit 1;
    if v_product is null then
      insert into public.products (store_id, name, category, product_group, base_unit, stock_base, is_active)
      values (p_store_id, v_name, v_category, v_group, v_unit, 0, false)
      returning id into v_product;
      -- Zero is an inactive placeholder, never the supplier quote or a usable selling price.
      insert into public.product_units (store_id, product_id, unit_key, unit_name, factor_to_base,
        purchase_price, sale_price, can_purchase, can_sell)
      values (p_store_id, v_product, 'base', v_unit, 1, null, coalesce(v_sale, 0), false, true);
      v_created := v_created + 1;
    else
      v_existing := v_existing + 1;
    end if;
    insert into public.product_source_quotes (store_id, source_id, product_id, source_name,
      original_price, reference_cost, purchase_unit, tiers, availability, review_note, original_line, imported_by)
    values (p_store_id, v_source, v_product, v_name, v_row ->> 'original_price', v_cost,
      v_row ->> 'purchase_unit', v_row ->> 'tiers', v_row ->> 'availability',
      v_row ->> 'review_note', v_row ->> 'original_line', v_user);
    v_quoted := v_quoted + 1;
    v_product := null;
  end loop;

  v_result := jsonb_build_object('created', v_created, 'matched', v_existing,
    'quoted', v_quoted, 'skipped_source', v_skipped);
  update public.catalog_import_batches set result = v_result
    where store_id = p_store_id and request_id = p_request_id;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, details)
  values (p_store_id, v_user, 'catalog.imported', 'catalog_import', v_result);
  return v_result;
end;
$$;

create or replace function public.save_category(
  p_store_id uuid,
  p_name text,
  p_category_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được quản lý loại hàng.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Tên loại hàng chưa hợp lệ.';
  end if;
  if p_category_id is null then
    insert into public.categories (store_id, name) values (p_store_id, btrim(p_name))
      returning id into v_id;
    update public.products set category_id = v_id
      where store_id = p_store_id and category_id is null
        and lower(btrim(category)) = lower(btrim(p_name));
  else
    update public.categories set name = btrim(p_name)
      where store_id = p_store_id and id = p_category_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy loại hàng.'; end if;
    update public.products set category = btrim(p_name), version = version + 1
      where store_id = p_store_id and category_id = v_id;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user,
    case when p_category_id is null then 'category.created' else 'category.updated' end,
    'category', v_id);
  return v_id;
end;
$$;

create or replace function public.save_supplier(
  p_store_id uuid,
  p_name text,
  p_phone text default null,
  p_address text default null,
  p_note text default null,
  p_supplier_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được quản lý nhà cung cấp.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120
    or char_length(coalesce(p_phone, '')) > 30
    or char_length(coalesce(p_address, '')) > 300
    or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'Thông tin nhà cung cấp chưa hợp lệ.';
  end if;
  if p_supplier_id is null then
    insert into public.suppliers (store_id, name, phone, address, note)
    values (p_store_id, btrim(p_name), nullif(btrim(p_phone), ''),
      nullif(btrim(p_address), ''), nullif(btrim(p_note), '')) returning id into v_id;
  else
    update public.suppliers set name = btrim(p_name), phone = nullif(btrim(p_phone), ''),
      address = nullif(btrim(p_address), ''), note = nullif(btrim(p_note), '')
      where store_id = p_store_id and id = p_supplier_id returning id into v_id;
    if v_id is null then raise exception 'Không tìm thấy nhà cung cấp.'; end if;
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user,
    case when p_supplier_id is null then 'supplier.created' else 'supplier.updated' end,
    'supplier', v_id);
  return v_id;
end;
$$;

create or replace function public.adjust_stock(
  p_store_id uuid,
  p_product_id uuid,
  p_quantity_base bigint,
  p_reason text,
  p_request_id uuid,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_existing public.stock_movements%rowtype;
  v_product public.products%rowtype;
  v_new_balance numeric;
  v_movement uuid;
  v_hash text;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được điều chỉnh tồn kho.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_quantity_base is null or p_quantity_base = 0
    or p_quantity_base::numeric not between -999999999999 and 999999999999 then
    raise exception 'Số lượng điều chỉnh chưa hợp lệ.';
  end if;
  if p_reason is null or p_reason not in
    ('damaged', 'spoiled', 'lost', 'inventory_correction', 'personal_use', 'other') then
    raise exception 'Lý do điều chỉnh chưa hợp lệ.';
  end if;
  if p_reason in ('damaged', 'spoiled', 'lost', 'personal_use') and p_quantity_base > 0 then
    raise exception 'Hàng hư hoặc hao hụt phải trừ tồn kho.';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;

  v_hash := encode(extensions.digest(jsonb_build_object(
    'product_id', p_product_id, 'quantity_base', p_quantity_base,
    'reason', p_reason, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_movements
    where store_id = p_store_id and movement_type = 'adjustment' and client_request_id = p_request_id;
  if found then
    if v_existing.adjustment_request_hash is distinct from v_hash then
      raise exception 'Mã yêu cầu đã được dùng cho một điều chỉnh khác.';
    end if;
    return jsonb_build_object('movement_id', v_existing.id,
      'balance_after', v_existing.balance_after, 'duplicate', true);
  end if;

  select * into v_product from public.products
    where store_id = p_store_id and id = p_product_id for update;
  if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
  v_new_balance := v_product.stock_base::numeric + p_quantity_base::numeric;
  if v_new_balance < 0 then raise exception 'Không đủ hàng để trừ tồn kho.'; end if;
  if v_new_balance > 9223372036854775807 then raise exception 'Tồn kho vượt giới hạn.'; end if;
  update public.products set stock_base = v_new_balance::bigint, version = version + 1
    where id = p_product_id and store_id = p_store_id;
  insert into public.stock_movements (store_id, product_id, movement_type,
    quantity_base, balance_after, client_request_id, adjustment_request_hash,
    adjustment_reason, reason, created_by)
  values (p_store_id, p_product_id, 'adjustment', p_quantity_base,
    v_new_balance::bigint, p_request_id, v_hash, p_reason, nullif(btrim(p_note), ''), v_user)
  returning id into v_movement;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.adjusted', 'stock_movement', v_movement,
    jsonb_build_object('product_id', p_product_id, 'quantity_base', p_quantity_base,
      'reason', p_reason, 'balance_after', v_new_balance::bigint));
  return jsonb_build_object('movement_id', v_movement,
    'balance_after', v_new_balance::bigint, 'duplicate', false);
end;
$$;

create or replace function public.receive_stock(
  p_store_id uuid,
  p_request_id uuid,
  p_items jsonb,
  p_note text,
  p_supplier_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_result jsonb;
  v_existing_supplier uuid;
begin
  if auth.uid() is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.';
  end if;
  perform public.require_store_operation(p_store_id,'receive_stock');
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers where store_id = p_store_id and id = p_supplier_id and is_active
  ) then raise exception 'Không tìm thấy nhà cung cấp.'; end if;
  v_result := public.receive_stock(p_store_id, p_request_id, p_items, p_note);
  if (v_result ->> 'duplicate')::boolean then
    select supplier_id into v_existing_supplier from public.stock_receipts
      where id = (v_result ->> 'receipt_id')::uuid and store_id = p_store_id;
    if v_existing_supplier is distinct from p_supplier_id then
      raise exception 'Mã yêu cầu đã được dùng với nhà cung cấp khác.';
    end if;
  else
    update public.stock_receipts set supplier_id = p_supplier_id
      where id = (v_result ->> 'receipt_id')::uuid and store_id = p_store_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.record_inventory_count(
  p_store_id uuid, p_request_id uuid, p_items jsonb, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_existing public.inventory_counts%rowtype;
  v_count uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_actual bigint;
  v_difference bigint;
  v_movement uuid;
  v_reason text;
  v_changed integer := 0;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được kiểm kê kho.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Danh sách kiểm kê phải có từ 1 đến 500 mặt hàng.';
  end if;
  if char_length(coalesce(p_note, '')) > 500 then raise exception 'Ghi chú tối đa 500 ký tự.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'items', p_items, 'note', nullif(btrim(p_note), '')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.inventory_counts
    where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.request_hash <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho lần kiểm kê khác.';
    end if;
    return jsonb_build_object('count_id', v_existing.id, 'duplicate', true);
  end if;
  if (select count(*) from (select distinct value ->> 'product_id'
    from jsonb_array_elements(p_items)) x) <> jsonb_array_length(p_items) then
    raise exception 'Mặt hàng kiểm kê bị lặp.';
  end if;
  perform p.id from public.products p where p.store_id = p_store_id
    and exists (select 1 from jsonb_array_elements(p_items) x
      where x.value ->> 'product_id' = p.id::text)
    order by p.id for update;

  insert into public.inventory_counts (store_id, client_request_id, request_hash, note, created_by)
  values (p_store_id, p_request_id, v_hash, nullif(btrim(p_note), ''), v_user)
  returning id into v_count;
  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_actual := (v_item ->> 'actual_base')::bigint;
      v_reason := nullif(btrim(v_item ->> 'reason'), '');
    exception when others then raise exception 'Số lượng kiểm kê chưa hợp lệ.'; end;
    if v_actual is null or v_actual < 0 or v_actual > 999999999999
      or char_length(coalesce(v_reason, '')) > 300 then
      raise exception 'Số lượng hoặc lý do kiểm kê chưa hợp lệ.';
    end if;
    select * into v_product from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid for update;
    if not found then raise exception 'Không tìm thấy mặt hàng kiểm kê.'; end if;
    v_difference := v_actual - v_product.stock_base;
    if v_difference <> 0 and v_reason is null then
      raise exception 'Cần ghi lý do khi tồn thực tế khác hệ thống.';
    end if;
    v_movement := null;
    if v_difference <> 0 then
      update public.products set stock_base = v_actual, version = version + 1
        where store_id = p_store_id and id = v_product.id;
      insert into public.stock_movements (store_id, product_id, movement_type,
        quantity_base, balance_after, inventory_count_id, reason, created_by)
      values (p_store_id, v_product.id, 'inventory_count', v_difference,
        v_actual, v_count, v_reason, v_user) returning id into v_movement;
      v_changed := v_changed + 1;
    end if;
    insert into public.inventory_count_items (store_id, count_id, product_id,
      system_quantity_base, actual_quantity_base, difference_base, reason, movement_id)
    values (p_store_id, v_count, v_product.id, v_product.stock_base,
      v_actual, v_difference, v_reason, v_movement);
  end loop;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'inventory.counted', 'inventory_count', v_count,
    jsonb_build_object('changed_products', v_changed, 'items', jsonb_array_length(p_items)));
  return jsonb_build_object('count_id', v_count, 'changed_products', v_changed, 'duplicate', false);
end;
$$;

create or replace function public.value_opening_stock(
  p_store_id uuid, p_product_id uuid, p_unit_key text,
  p_cost_per_unit bigint, p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_existing public.opening_cost_valuations%rowtype;
  v_product public.products%rowtype;
  v_factor bigint;
  v_cost numeric(20,8);
  v_valuation uuid;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được định giá tồn đầu kỳ.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if p_cost_per_unit is null or p_cost_per_unit not between 0 and 999999999 then
    raise exception 'Giá vốn nhập chưa hợp lệ.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.opening_cost_valuations
    where store_id = p_store_id and client_request_id = p_request_id;
  if found then
    if v_existing.product_id is distinct from p_product_id
      or v_existing.unit_key is distinct from p_unit_key
      or v_existing.cost_per_unit is distinct from p_cost_per_unit then
      raise exception 'Mã yêu cầu đã dùng cho định giá khác.';
    end if;
    return jsonb_build_object('valuation_id', v_existing.id,
      'cost_per_base', v_existing.cost_per_base, 'duplicate', true);
  end if;
  select * into v_product from public.products
    where store_id = p_store_id and id = p_product_id for update;
  if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
  if v_product.stock_base = 0 then
    raise exception 'Mặt hàng chưa có tồn để định giá.';
  end if;
  if v_product.average_cost_per_base is not null then
    raise exception 'Mặt hàng đã có giá vốn; không thể định giá lần hai.';
  end if;
  select factor_to_base into v_factor from public.product_units
    where store_id = p_store_id and product_id = p_product_id and unit_key = p_unit_key;
  if not found then raise exception 'Đơn vị định giá chưa hợp lệ.'; end if;
  v_cost := p_cost_per_unit::numeric / v_factor;
  update public.products set average_cost_per_base = v_cost
    where store_id = p_store_id and id = p_product_id;
  insert into public.opening_cost_valuations
    (store_id, product_id, client_request_id, unit_key, stock_base_at_valuation,
      cost_per_unit, cost_per_base, created_by)
  values (p_store_id, p_product_id, p_request_id, p_unit_key, v_product.stock_base,
    p_cost_per_unit, v_cost, v_user) returning id into v_valuation;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id, details)
  values (p_store_id, v_user, 'stock.opening_valued', 'product', p_product_id,
    jsonb_build_object('valuation_id', v_valuation, 'unit_key', p_unit_key,
      'stock_base', v_product.stock_base));
  return jsonb_build_object('valuation_id', v_valuation,
    'cost_per_base', v_cost, 'duplicate', false);
end;
$$;

create or replace function public.create_customer(
  p_store_id uuid, p_request_id uuid, p_name text,
  p_phone text default null, p_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_hash text;
  v_existing public.customer_create_requests%rowtype;
begin
  if v_user is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.' using errcode = '42501';
  end if;
  perform public.require_store_operation(p_store_id,'manage_debt');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if char_length(btrim(coalesce(p_name,''))) not between 1 and 120
    or char_length(coalesce(p_phone,'')) > 30 or char_length(coalesce(p_note,'')) > 500 then
    raise exception 'Thông tin khách chưa hợp lệ.';
  end if;
  v_hash := encode(extensions.digest(jsonb_build_object(
    'name', btrim(p_name), 'phone', nullif(btrim(p_phone),''),
    'note', nullif(btrim(p_note),'')
  )::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.customer_create_requests
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho khách khác.';
    end if;
    return jsonb_build_object('customer_id', v_existing.customer_id, 'duplicate', true);
  end if;
  insert into public.customers (store_id, name, phone, note, is_in_debt_book)
    values (p_store_id, btrim(p_name), nullif(btrim(p_phone),''),
      nullif(btrim(p_note),''), true) returning id into v_id;
  insert into public.customer_create_requests
    (store_id, request_id, customer_id, payload_sha256, created_by)
    values (p_store_id, p_request_id, v_id, v_hash, v_user);
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
    values (p_store_id, v_user, 'customer.created', 'customer', v_id);
  return jsonb_build_object('customer_id', v_id, 'duplicate', false);
end;
$$;

create or replace function public.import_stock_csv(
  p_store_id uuid, p_request_id uuid, p_rows jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_existing public.stock_csv_imports%rowtype;
  v_row jsonb;
  v_product jsonb;
  v_product_id uuid;
  v_items jsonb := '[]'::jsonb;
  v_receipts jsonb := '[]'::jsonb;
  v_receipt jsonb;
  v_count integer;
begin
  if v_user is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ tiệm được nhập CSV hàng loạt.' using errcode = '42501';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null then raise exception 'Thiếu mã chống ghi trùng.'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Danh sách CSV chưa hợp lệ.'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count not between 1 and 2000 or octet_length(p_rows::text) > 8388608 then
    raise exception 'CSV cần từ 1 đến 2.000 dòng và tối đa 8 MB dữ liệu.';
  end if;
  v_hash := encode(extensions.digest(p_rows::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.stock_csv_imports
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_sha256 <> v_hash then
      raise exception 'Mã yêu cầu đã dùng cho file CSV khác.';
    end if;
    return jsonb_build_object('row_count', v_existing.row_count,
      'receipt_ids', v_existing.receipt_ids, 'duplicate', true);
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Dòng CSV chưa hợp lệ.'; end if;
    v_product_id := nullif(v_row ->> 'existing_product_id','')::uuid;
    if v_product_id is null then
      v_product := v_row -> 'product';
      if jsonb_typeof(v_product) <> 'object' then raise exception 'Hàng mới thiếu thông tin.'; end if;
      v_product_id := public.save_product(p_store_id,
        v_product ->> 'name', v_product ->> 'category',
        v_product ->> 'product_group', v_product ->> 'base_unit',
        v_product -> 'units', 0, (v_product ->> 'low_stock_threshold')::bigint,
        true, null);
    else
      if not exists (select 1 from public.products
        where id = v_product_id and store_id = p_store_id and is_active) then
        raise exception 'Mặt hàng CSV không còn trong kho đang bán.';
      end if;
    end if;
    if (v_row ->> 'unit_key') !~ '^[a-z][a-z0-9_]{0,23}$'
      or nullif(v_row ->> 'quantity','') is null
      or nullif(v_row ->> 'unit_cost','') is null then
      raise exception 'Đơn vị, số lượng hoặc giá nhập CSV chưa hợp lệ.';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id, 'unit_key', v_row ->> 'unit_key',
      'quantity', (v_row ->> 'quantity')::numeric,
      'unit_cost', (v_row ->> 'unit_cost')::bigint));
    if jsonb_array_length(v_items) = 500 then
      v_receipt := public.receive_stock(p_store_id, extensions.gen_random_uuid(), v_items, 'Nhập hàng từ CSV');
      v_receipts := v_receipts || jsonb_build_array(v_receipt -> 'receipt_id');
      v_items := '[]'::jsonb;
    end if;
  end loop;
  if jsonb_array_length(v_items) > 0 then
    v_receipt := public.receive_stock(p_store_id, extensions.gen_random_uuid(), v_items, 'Nhập hàng từ CSV');
    v_receipts := v_receipts || jsonb_build_array(v_receipt -> 'receipt_id');
  end if;
  insert into public.stock_csv_imports
    (store_id, request_id, payload_sha256, row_count, receipt_ids, created_by)
    values (p_store_id, p_request_id, v_hash, v_count, v_receipts, v_user);
  insert into public.audit_logs (store_id, actor_id, action, entity_type, details)
    values (p_store_id, v_user, 'stock.csv_imported', 'stock_csv_import',
      jsonb_build_object('rows', v_count, 'receipts', jsonb_array_length(v_receipts)));
  return jsonb_build_object('row_count', v_count, 'receipt_ids', v_receipts, 'duplicate', false);
end;
$$;

create or replace function public.cancel_sale_confirmed(p_store_id uuid, p_sale_id uuid,
  p_reason text, p_request_id uuid, p_preview_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_customer uuid;
  v_preview jsonb;
  v_hash text;
  v_existing public.sale_cancellation_requests%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được hủy đơn.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null or p_preview_token is null then raise exception 'Thiếu mã xác nhận hủy đơn.'; end if;
  v_hash := encode(extensions.digest(jsonb_build_array(p_sale_id, btrim(p_reason), p_preview_token)::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.sale_cancellation_requests
    where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã dùng cho lần hủy khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate', true);
  end if;
  -- Follow the same customer -> sale -> product lock order as debt repayment.
  select customer_id into v_customer from public.sales where store_id = p_store_id and id = p_sale_id;
  if v_customer is not null then
    perform 1 from public.customers where store_id = p_store_id and id = v_customer for update;
  end if;
  perform 1 from public.sales where store_id = p_store_id and id = p_sale_id for update;
  v_preview := public.preview_sale_cancellation(p_store_id, p_sale_id);
  if v_preview ->> 'preview_token' <> p_preview_token then
    raise exception 'Số tiền hoàn hoặc công nợ đã thay đổi. Hãy mở lại xác nhận hủy đơn.';
  end if;
  v_result := public.cancel_sale(p_store_id, p_sale_id, p_reason);
  insert into public.sale_cancellation_requests(store_id, request_id, payload_hash, result, created_by)
    values(p_store_id, p_request_id, v_hash, v_result, auth.uid());
  return v_result;
end;
$$;

create or replace function public.save_product_idempotent(p_store_id uuid, p_request_id uuid, p_product jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.product_save_requests%rowtype;
  v_hash text;
  v_id uuid;
  v_version bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được sửa mặt hàng.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null or jsonb_typeof(p_product) is distinct from 'object' then
    raise exception 'Thông tin mặt hàng chưa hợp lệ.';
  end if;
  v_hash := encode(extensions.digest(p_product::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  select * into v_existing from public.product_save_requests where store_id = p_store_id and request_id = p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã dùng cho mặt hàng khác.'; end if;
    return v_existing.product_id;
  end if;
  v_id := (p_product ->> 'p_product_id')::uuid;
  if v_id is not null then
    select version into v_version from public.products where store_id = p_store_id and id = v_id for update;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if (p_product ->> 'expected_version')::bigint is distinct from v_version then
      raise exception 'Mặt hàng đã thay đổi. Hãy tải lại thông tin trước khi lưu.';
    end if;
  end if;
  v_id := public.save_product(p_store_id, p_product ->> 'p_name', p_product ->> 'p_category',
    p_product ->> 'p_product_group', p_product ->> 'p_base_unit', p_product -> 'p_units',
    coalesce((p_product ->> 'p_opening_stock')::bigint, 0),
    coalesce((p_product ->> 'p_low_stock_threshold')::bigint, 5),
    coalesce((p_product ->> 'p_is_active')::boolean, true), v_id);
  insert into public.product_save_requests(store_id, request_id, payload_hash, product_id, created_by)
    values(p_store_id, p_request_id, v_hash, v_id, auth.uid());
  return v_id;
end;
$$;

create or replace function public.record_inventory_count_reviewed(p_store_id uuid, p_request_id uuid,
  p_items jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_version bigint;
begin
  if auth.uid() is null or not public.is_store_owner(p_store_id) then
    raise exception 'Chỉ chủ cửa hàng được kiểm kê kho.';
  end if;
  perform public.require_store_operation(p_store_id,'manage_shop');
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Danh sách kiểm kê phải có từ 1 đến 500 mặt hàng.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text, 0));
  -- A committed retry must be returned before checking versions changed by that commit.
  if exists (select 1 from public.inventory_counts where store_id = p_store_id and client_request_id = p_request_id) then
    return public.record_inventory_count(p_store_id, p_request_id, p_items, p_note);
  end if;
  perform p.id from public.products p where p.store_id = p_store_id
    and exists (select 1 from jsonb_array_elements(p_items) x where x.value ->> 'product_id' = p.id::text)
    order by p.id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select version into v_version from public.products
      where store_id = p_store_id and id = (v_item ->> 'product_id')::uuid;
    if not found then raise exception 'Không tìm thấy mặt hàng kiểm kê.'; end if;
    if (v_item ->> 'expected_version')::bigint is distinct from v_version then
      raise exception 'Kho đã có giao dịch mới. Hãy tải lại và đếm lại mặt hàng trước khi kiểm kê.';
    end if;
  end loop;
  return public.record_inventory_count(p_store_id, p_request_id, p_items, p_note);
end;
$$;

create or replace function public.create_sale_reviewed(p_store_id uuid, p_request_id uuid, p_items jsonb,
  p_payment_type text default 'cash', p_customer_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb; v_hash text; v_item jsonb; v_version bigint; v_result jsonb;
  v_existing public.reviewed_sale_requests%rowtype;
begin
  if auth.uid() is null or not public.is_store_member(p_store_id) then
    raise exception 'Bạn không có quyền với cửa hàng này.' using errcode = '42501';
  end if;
  perform public.require_store_operation(p_store_id,'sell');
  if p_payment_type='credit' then perform public.require_store_operation(p_store_id,'manage_debt'); end if;
  if p_request_id is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Giỏ hàng chưa hợp lệ.'; end if;
  select jsonb_agg(value - 'expected_version' order by value->>'product_id', value->>'unit_key')
    into v_items from jsonb_array_elements(p_items);
  v_hash := encode(extensions.digest(jsonb_build_array(v_items,p_payment_type,p_customer_id)::text,'sha256'),'hex');
  if p_payment_type = 'credit' then
    perform 1 from public.customers where store_id=p_store_id and id=p_customer_id for update;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':' || p_request_id::text,0));
  select * into v_existing from public.reviewed_sale_requests where store_id=p_store_id and request_id=p_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'Mã yêu cầu đã được dùng cho đơn bán khác.'; end if;
    return v_existing.result || jsonb_build_object('duplicate',true);
  end if;
  perform p.id from public.products p where p.store_id=p_store_id and exists (
    select 1 from jsonb_array_elements(p_items) x where x.value->>'product_id'=p.id::text
  ) order by p.id for update;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select version into v_version from public.products where store_id=p_store_id and id=(v_item->>'product_id')::uuid;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if (v_item->>'expected_version')::bigint is distinct from v_version then
      raise exception 'Giá hoặc tồn kho đã thay đổi. Hãy tải lại giỏ hàng và xác nhận số tiền mới.';
    end if;
  end loop;
  v_result := public.create_sale(p_store_id,p_request_id,v_items,p_payment_type,p_customer_id);
  insert into public.reviewed_sale_requests(store_id,request_id,payload_hash,result,created_by)
    values(p_store_id,p_request_id,v_hash,v_result,auth.uid());
  return v_result;
end;
$$;
