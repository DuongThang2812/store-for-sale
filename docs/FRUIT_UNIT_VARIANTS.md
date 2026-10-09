# Trái cây — cân, đếm và đóng gói

Cập nhật 05/10/2026. Bổ sung yêu cầu mục 22/128 về fruit units và mục 9 về danh mục riêng, giữ React/JavaScript, demo và luồng Page → Service → RPC → PostgreSQL.

## Chọn đơn vị trong form hàng

`Nhập hàng → Trái cây → Cách bán trái cây`:

| Cách bán | Đơn vị tồn | Giá nhập/bán chính | Số lượng |
| --- | --- | --- | --- |
| Cân theo kg | gram | mỗi kg | kg tối đa 3 số lẻ, chính xác đến 1 gram |
| Theo quả/trái/hộp/khay/túi/thùng | đơn vị đã chọn | mỗi đơn vị | số nguyên |

Hàng cân có thể khai báo thêm giá bán/lạng và giá bán/gram. Bỏ trống thì không hiện đơn vị đó ở trang Bán hàng. Giá từng đơn vị độc lập, không suy ra giá lạng/gram từ giá/kg.

Có thể bật thêm một đơn vị đóng gói: ví dụ khay 500 gram hoặc thùng 12 quả. Chọn dùng để nhập, bán hoặc cả hai; chỉ cần giá tương ứng với vai trò đã chọn. Mọi đơn vị của cùng mặt hàng dùng **một số tồn duy nhất**. Chọn khay/thùng ở giao diện theo số nguyên; giới hạn giỏ làm tròn xuống số gói nguyên có thể bán, không biến một khay thành khay lẻ khi thiếu tồn.

Không đổi trái cây đang bán theo gram thành quả/hộp khi đã có tồn/lịch sử. Tạo mặt hàng mới nếu đổi cách quản lý. Mapper giữ cả quy ước `kg` thông thường và trường hợp dữ liệu cũ dùng key `pack` cho kg; thêm đóng gói vào trường hợp cũ dùng key `fruit_pack`, không đổi key kg đã có.

## Giao dịch và giá vốn

Client chỉ gửi ý định giao dịch, đơn vị, lượng, phiên bản quan sát và request ID. PostgreSQL đọc hệ số/giá, ghi snapshot, COGS, nợ và movement trong transaction hiện có.

Ví dụ giá thử: kg 180.000đ, lạng 17.000đ, gram 200đ, khay 500 gram giá 100.000đ. Bán 0,5 kg + 1 lạng + 20 gram + 1 khay trừ 1.120 gram, doanh thu 211.000đ. Với vốn 120đ/gram, COGS là 134.400đ và lãi gộp 76.600đ. Hủy đơn hoàn đúng gram và giá vốn snapshot, retry không hoàn hai lần.

Nhập hai khay 500 gram, giá nhập 95.000đ/khay, phải cộng 1.000 gram và ghi tổng nhập 190.000đ. Giá nhập/kg không bị ghi đè bằng giá/khay. Bình quân giá vốn chia tổng vốn cho cùng đơn vị tồn. Hàng theo quả cũng dùng cùng RPC, nhưng giá vốn chuẩn là mỗi quả.

Tồn mở đầu cũ trên cloud vẫn chưa rõ vốn cho đến khi owner định giá; không lấy giá nhập hiện tại để giả lập vốn lịch sử. Receipt/CSV có giá thực nhập mới tạo giá vốn xác định.

## CSV và danh mục

CSV xuất giữ các cột cũ và thêm `Quy cách trái cây` chứa JSON về các đơn vị bán thêm. App tự xuất/đọc cột này; có thể tạo/sửa quy cách trong form rồi tải danh sách để dùng mẫu đầy đủ, không cần tự viết JSON.

- `Giá bán` của hàng cân là giá/kg; hàng đếm là giá/đơn vị tồn.
- `Giá nhập 1 kg` dành cho hàng cân. `Giá nhập` là giá của đơn vị nhập trên dòng; hàng đếm xuất tồn theo đơn vị cơ sở dùng cột này.
- Gram/lạng nhập vào hàng cân được chuẩn hóa sang kg khi gửi receipt RPC. Khay/thùng giữ đơn vị nhập và giá tương ứng.
- JSON giữ giá nhập đơn vị cơ sở của hàng đếm riêng, để nhận thùng không vô tình gán giá/thùng thành giá/quả.
- Cột `Loại hàng` giữ danh mục riêng cho cả grocery và fruit. Nhóm quy cách vẫn là Nước/Bia/Hạt/Trái cây...; danh mục không quyết định hệ số hoặc công thức giá.
- Danh mục trong form có gợi ý từ DB của shop đang chọn, hoặc từ hàng demo hiện tại. Đổi shop thì không hiện lại gợi ý của shop cũ.
- Nhập danh sách là cộng lượng nhận, không ghi đè snapshot tồn. Quy cách trái cây trong file khác quy cách hiện có bị chặn.

## File đảm nhiệm

| File | Nhiệm vụ |
| --- | --- |
| `src/utils/productPricing.js` | Cách cân/đếm, giá từng đơn vị, pack tùy chọn, cập nhật đúng giá nhập đơn vị. |
| `src/components/PricingFields.jsx` | Chọn cách bán, giá kg/lạng/gram, đơn vị đóng gói và quyền nhập/bán của đơn vị. |
| `src/mappers/productMapper.js` | Đọc/ghi product_units, giữ fruit group, key đơn vị legacy và cờ nhập/bán. |
| `src/components/SaleProductCard.jsx`, `src/pages/SalesPages.jsx` | Chọn cân hoặc số quả/gói; giỏ mixed-unit. |
| `src/pages/StockPages.jsx` | Tạo/sửa/nhập, danh mục riêng, ngưỡng tồn đúng đơn vị. |
| `src/stores/useShopStore.js`, `useCloudShopStore.js` | Giỏ cân lưu gram, giỏ đếm lưu số đơn vị; cloud không tự cập nhật tồn. |
| `src/utils/stockCsv.js`, `src/mappers/stockCsvMapper.js` | Đọc/xuất quy cách, danh mục, chuẩn hóa receipt dùng chung cho demo/cloud. |
| `src/utils/backup.js` | Kiểm tra lịch sử gram/lạng/kg và phục hồi demo. |
| `src/pages/CsvImportPage.jsx`, `InventoryCountPage.jsx` | Hiển thị đúng đơn vị giá/tồn; kiểm kê theo đơn vị cơ sở. |
| `tests/fruit-shop.test.js` | 17 JS tests gồm 6 test cũ và 11 test đơn vị/danh mục mới. |
| `backend/supabase/tests/fruit_unit_variants.test.sql` | 31 assertion SQL về đơn vị, giá/vốn, receipt, hủy, CSV, danh mục và tenant isolation. |

Không thêm migration ở đợt này: schema/RPC hiện có đã hỗ trợ các đơn vị kể từ `202610040001_multi_business_fruit.sql`. Tất cả 31 migration được kiểm tra cùng nhau trên PostgreSQL tạm. Không rename bảng, không chuyển tồn, không mở Docker hoặc thay đổi DB thật.

## Kết quả kiểm tra

`npm test`: 112/112 đạt. `npm run lint` và `npm run build` đạt. PostgreSQL tạm: 389/389 pgTAP assertions cùng kiểm tra giao dịch cạnh tranh đạt; cluster đã dừng. Fixture mock `auth.uid()`, chưa chứng minh integration Auth/PostgREST/Edge mới nhất trên Supabase thật. Xem `DATABASE_TESTING.md` và `CLOUD_IMPLEMENTATION_STATUS.md` cho phạm vi còn cần kiểm chứng.
