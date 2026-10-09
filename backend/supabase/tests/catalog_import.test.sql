begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);

select lives_ok($$
  select public.import_catalog_drafts(
    '00000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000099',
    '[
      {"source_id":"GTEST1","name":"Hàng Excel kiểm tra","category":"Nước ngọt","product_group":"drinks","base_unit":"lon","purchase_price":168000,"sale_price":null,"original_price":"168","purchase_unit":"thùng","tiers":"50t 167","availability":"Chưa xác nhận","review_note":"Cần rà soát","original_line":"Hàng Excel kiểm tra 168"},
      {"source_id":"GTEST2","name":"Hàng Excel kiểm tra","category":"Nước ngọt","product_group":"drinks","base_unit":"lon","purchase_price":167000,"sale_price":null,"original_price":"167","purchase_unit":"thùng","tiers":"","availability":"Chưa xác nhận","review_note":"","original_line":"Hàng Excel kiểm tra 167"}
    ]'::jsonb
  )
$$, 'Nhập cả file trong một RPC');
select is((select count(*) from public.products where name = 'Hàng Excel kiểm tra'), 1::bigint,
  'Hai dòng tên trùng chỉ tạo một mặt hàng');
select is((select count(*) from public.product_source_quotes where source_id in ('GTEST1', 'GTEST2')), 2::bigint,
  'Cả hai dòng giá nguồn đều được lưu');
select is((select stock_base from public.products where name = 'Hàng Excel kiểm tra'), 0::bigint,
  'Nhập danh mục không tạo tồn kho');
select is((select is_active from public.products where name = 'Hàng Excel kiểm tra'), false,
  'Hàng mới chưa bật bán');
select is((select sale_price from public.product_units u join public.products p on p.id = u.product_id
  where p.name = 'Hàng Excel kiểm tra' and u.unit_key = 'base'), 0::bigint,
  'Không dùng giá nhập làm giá bán');
set constraints products_guard_draft_activation immediate;
select throws_ok($$
  select public.save_product(
    '00000000-0000-0000-0000-000000000201', 'Hàng Excel kiểm tra', 'Nước ngọt',
    'drinks', 'lon',
    '[{"key":"base","name":"lon","factor":1,"sale_price":0,"can_sell":true,"can_purchase":false}]'::jsonb,
    0, 5, true,
    (select id from public.products where name = 'Hàng Excel kiểm tra')
  )
$$, 'P0001', 'Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.', 'Không bật bán khi giá bán chưa rõ');
select is((public.import_catalog_drafts(
  '00000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000099',
  '[{"source_id":"GTEST1"}]'::jsonb
))->>'quoted', '2', 'Gửi lại cùng request trả kết quả cũ');
select is((select count(*) from public.product_source_quotes where source_id in ('GTEST1', 'GTEST2')), 2::bigint,
  'Gửi lại không ghi giá nguồn lần hai');

select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
select throws_ok($$
  select public.import_catalog_drafts(
    '00000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000098',
    '[{"source_id":"GTEST3"}]'::jsonb
  )
$$, 'P0001', 'Chỉ chủ cửa hàng được nhập danh mục vào DB.', 'Người ngoài cửa hàng bị chặn');

select * from finish();
rollback;
