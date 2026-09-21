-- Product and customer writes also go through RPCs so protected balances cannot be edited directly.

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
begin
  if v_user is null or not public.is_store_member(p_store_id) then raise exception 'Bạn không có quyền với cửa hàng này.'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 120 or char_length(btrim(coalesce(p_category, ''))) not between 1 and 80 then raise exception 'Tên hoặc nhóm hiển thị chưa hợp lệ.'; end if;
  if p_product_group not in ('snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'other') then raise exception 'Nhóm hàng chưa hợp lệ.'; end if;
  if p_base_unit not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên') then raise exception 'Đơn vị tồn kho chưa hợp lệ.'; end if;
  if p_opening_stock < 0 or p_low_stock_threshold < 0 then raise exception 'Số lượng không được âm.'; end if;
  if jsonb_typeof(p_units) <> 'array' or jsonb_array_length(p_units) not between 1 and 3 then raise exception 'Mặt hàng cần từ 1 đến 3 đơn vị.'; end if;
  if (select count(*) from (select distinct value ->> 'key' from jsonb_array_elements(p_units)) x) <> jsonb_array_length(p_units) then raise exception 'Đơn vị bị trùng.'; end if;
  if not exists (select 1 from jsonb_array_elements(p_units) where value ->> 'key' = 'base') then raise exception 'Thiếu đơn vị bán lẻ.'; end if;

  if p_product_id is null then
    insert into public.products (store_id, name, category, product_group, base_unit, stock_base, low_stock_threshold, is_active)
    values (p_store_id, btrim(p_name), btrim(p_category), p_product_group, p_base_unit, p_opening_stock, p_low_stock_threshold, p_is_active)
    returning id into v_id;
  else
    select * into v_old from public.products where store_id = p_store_id and id = p_product_id for update;
    if not found then raise exception 'Không tìm thấy mặt hàng.'; end if;
    if v_old.stock_base > 0 and v_old.base_unit <> p_base_unit then raise exception 'Mặt hàng còn tồn kho nên chưa thể đổi đơn vị nhỏ nhất.'; end if;
    v_id := v_old.id;
    update public.products set name = btrim(p_name), category = btrim(p_category), product_group = p_product_group,
      base_unit = p_base_unit, low_stock_threshold = p_low_stock_threshold, is_active = p_is_active, version = version + 1
    where id = v_id;
  end if;

  for v_unit in select value from jsonb_array_elements(p_units) loop
    begin
      v_key := v_unit ->> 'key'; v_name := v_unit ->> 'name'; v_factor := (v_unit ->> 'factor')::bigint;
      v_purchase := nullif(v_unit ->> 'purchase_price', '')::bigint; v_sale := nullif(v_unit ->> 'sale_price', '')::bigint;
      v_can_purchase := coalesce((v_unit ->> 'can_purchase')::boolean, false); v_can_sell := coalesce((v_unit ->> 'can_sell')::boolean, false);
    exception when others then raise exception 'Thông tin đơn vị chưa hợp lệ.'; end;
    if v_key not in ('base', 'bag', 'pack') or v_name not in ('cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên') or v_factor <= 0 then raise exception 'Tên hoặc hệ số đơn vị chưa hợp lệ.'; end if;
    if (v_purchase is not null and v_purchase not between 0 and 999999999) or (v_sale is not null and v_sale not between 0 and 999999999) then raise exception 'Giá vượt giới hạn.'; end if;
    if (v_can_purchase and v_purchase is null) or (v_can_sell and v_sale is null) or not (v_can_purchase or v_can_sell) then raise exception 'Mỗi đơn vị cần giá phù hợp với cách nhập hoặc bán.'; end if;

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

  if p_product_id is null and p_opening_stock > 0 then
    insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, reason, created_by)
    values (p_store_id, v_id, 'opening', p_opening_stock, p_opening_stock, 'Tồn kho ban đầu', v_user);
  end if;
  insert into public.audit_logs (store_id, actor_id, action, entity_type, entity_id)
  values (p_store_id, v_user, case when p_product_id is null then 'product.created' else 'product.updated' end, 'product', v_id);
  return v_id;
end;
$$;

revoke all on function public.save_customer(uuid, text, text, text, uuid),
  public.save_product(uuid, text, text, text, text, jsonb, bigint, bigint, boolean, uuid) from public, anon;
grant execute on function public.save_customer(uuid, text, text, text, uuid),
  public.save_product(uuid, text, text, text, text, jsonb, bigint, bigint, boolean, uuid) to authenticated;
