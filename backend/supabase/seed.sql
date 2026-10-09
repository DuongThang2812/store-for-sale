-- Reproducible local data. This Auth row is a placeholder for DB tests;
-- create a login-capable user from local Studio when testing the UI.
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000101', 'chu-tiem@example.com', '{"name":"Chủ tiệm BIN"}'::jsonb)
on conflict (id) do nothing;

insert into public.stores (id, name, created_by)
values ('00000000-0000-0000-0000-000000000201', 'Tạp hóa BIN', '00000000-0000-0000-0000-000000000101')
on conflict (id) do nothing;
insert into public.store_members (store_id, user_id, role)
values ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'owner')
on conflict do nothing;

insert into public.products (id, store_id, name, category, product_group, base_unit, stock_base) values
('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000201', 'Bánh gói mẫu', 'Bánh kẹo', 'snacks', 'gói', 100),
('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000201', 'Nước lon mẫu', 'Nước', 'drinks', 'lon', 72),
('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000201', 'Bia lon mẫu', 'Bia', 'beer', 'lon', 48),
('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000201', 'Nước mắm mẫu', 'Gia vị', 'spices', 'chai', 12),
('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000201', 'Hạt mẫu', 'Hạt', 'seeds', 'lạng', 50),
('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000201', 'Thuốc lá mẫu', 'Thuốc lá', 'tobacco', 'gói', 100)
on conflict (id) do nothing;

insert into public.product_units (store_id, product_id, unit_key, unit_name, factor_to_base, purchase_price, sale_price, can_purchase, can_sell) values
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'base', 'gói', 1, null, 4500, false, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'bag', 'bịch', 10, 35000, null, true, false),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000301', 'pack', 'thùng', 100, 300000, null, true, false),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000302', 'base', 'lon', 1, null, 10000, false, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000302', 'pack', 'thùng', 24, 180000, 220000, true, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'base', 'lon', 1, null, 18000, false, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'pack', 'thùng', 24, 330000, 390000, true, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000304', 'base', 'chai', 1, 25000, 35000, true, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000305', 'base', 'lạng', 1, null, 8000, false, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000305', 'pack', 'kg', 10, 50000, null, true, false),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000306', 'base', 'gói', 1, null, 25000, false, true),
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000306', 'pack', 'cây', 10, 200000, 230000, true, true)
on conflict (store_id, product_id, unit_key) do nothing;

insert into public.customers (id, store_id, name, phone, note)
values ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000201', 'Khách thử', '0900 000 000', 'Dùng để thử luồng mua chịu')
on conflict (id) do nothing;

insert into public.stock_movements (store_id, product_id, movement_type, quantity_base, balance_after, reason, created_by)
select p.store_id, p.id, 'opening', p.stock_base, p.stock_base, 'Dữ liệu mẫu ban đầu', '00000000-0000-0000-0000-000000000101'
from public.products p
where p.store_id = '00000000-0000-0000-0000-000000000201' and p.stock_base > 0
  and not exists (select 1 from public.stock_movements m where m.product_id = p.id and m.movement_type = 'opening');
