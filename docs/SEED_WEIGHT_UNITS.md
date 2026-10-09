# Hạt — nhập kg, bán kg/lạng, tồn bằng gram

Cập nhật 05/10/2026. Triển khai mục 15 và ca kiểm thử 104 của yêu cầu grocery. Migration mới chưa áp vào Supabase cửa hàng; kiểm tra SQL dùng PostgreSQL tạm riêng.

## Hàng mới

| Đơn vị | Hệ số về gram | Vai trò | Giá |
| --- | ---: | --- | --- |
| gram (`base`) | 1 | Đo tồn, kiểm kê, hao hụt | Không tạo giá bán theo gram |
| lạng (`lang`) | 100 | Bán | Giá bán 1 lạng |
| kg (`pack`) | 1000 | Nhập và bán | Giá nhập 1 kg; giá bán 1 kg riêng |

Form nhóm Hạt có giá nhập/kg, bán/lạng và bán/kg. Bỏ trống giá bán/kg khi lưu thì lấy 10 lần giá/lạng; giá được lưu và hiển thị để chủ tiệm kiểm tra. Có thể nhập giá/kg khác để bán nguyên kg rẻ hơn. Mỗi giá giới hạn 0–999.999.999đ, hàng cân đang bán cần ít nhất một giá bán dương trên server.

Trang Bán hàng cho chọn kg hoặc lạng, nhập cân lẻ và chọn nhanh. Kg tối đa 3 số lẻ; lạng tối đa 2 số lẻ, chính xác đến 1 gram. Hai đơn vị có thể cùng xuất hiện trong giỏ; tổng gram của cả hai không vượt tồn.

Giỏ nháp lưu gram nguyên. Khi thanh toán, client gửi ID hàng, unit key, số lượng theo đơn vị, phiên bản quan sát và request ID. PostgreSQL đọc giá/hệ số thật, tính tiền, COGS, trừ tồn, ghi movement và công nợ trong transaction. Không gửi số dư, tồn sau bán hoặc tổng tiền do client tự quyết định. Làm tròn tiền từng dòng đến đồng gần nhất, phần nửa đồng làm tròn lên.

## Tương thích dữ liệu cũ

Hạt cũ đang dùng `base_unit = lạng` vẫn giữ factor kg = 10, stock và lịch sử nguyên trạng. Form sửa tiếp tục quy cách cũ; migration không cập nhật hay nhân tồn cũ. Không đổi base unit khi còn tồn hoặc đã có lịch sử kho. Muốn dùng gram cho loại hàng cũ thì tạo mặt hàng mới và đối chiếu việc chuyển tồn bằng nghiệp vụ riêng.

Backup demo vẫn phiên bản 1, đọc được lịch sử cũ; lịch sử mới theo kg/lạng có `stockUnit = gram`, `stockQuantity` nguyên và thành tiền được kiểm tra đúng theo hệ số. Hủy đơn hoàn đúng gram của từng dòng và giữ snapshot giá lúc bán.

## CSV

File mẫu Hạt có thêm `Giá bán 1 kg` và `Đơn vị tồn = gram`. CSV xuất danh sách giữ các cột cũ, thêm hai cột này ở cuối; `Giá bán` của nhóm Hạt là giá/lạng, `Còn lại` theo đơn vị tồn.

- CSV kg cũ chưa có cột `Đơn vị tồn`: nếu khớp hàng Hạt cũ trong kho thì dùng lạng/factor 10; nếu là hàng mới thì tạo gram/factor 1000.
- File khai báo gram khác quy cách lạng đang có bị chặn, không chuyển đơn vị âm thầm.
- Nhập gram/lạng cho hàng cân được chuẩn hóa sang kg khi gửi RPC nhập: ví dụ 125 gram = 0,125 kg. Nếu có `Giá nhập` theo lạng/gram thì quy về giá/kg; nếu dùng mẫu đầy đủ thì lấy `Giá nhập 1 kg`.
- File xuất tồn nhập lại qua chức năng nhập hàng sẽ **cộng lượng nhập**, không ghi đè số tồn. Chỉ nhập khi đó là số lượng thực nhận.

## File đảm nhiệm

| File | Nhiệm vụ |
| --- | --- |
| `src/utils/productPricing.js` | Quy cách, đổi lượng chính xác, tiền xem trước bằng BigInt, giỏ chung tồn. |
| `src/mappers/productMapper.js` | Gram/lang/kg giữa UI và DB; giữ lạng legacy. |
| `src/components/PricingFields.jsx`, `SaleProductCard.jsx` | Giá mỗi đơn vị, chọn cân lẻ. |
| `src/pages/SalesPages.jsx`, `StockPages.jsx` | Giỏ, nhập kg, tạo/sửa hàng. |
| `src/stores/useShopStore.js`, `useCloudShopStore.js` | Giỏ demo/cloud và tách giỏ công nợ; cloud không persist tồn/số dư. |
| `src/utils/stockCsv.js`, `src/mappers/stockCsvMapper.js` | CSV mới/cũ và chuẩn hóa receipt RPC. |
| `src/utils/backup.js` | Kiểm tra snapshot lịch sử kg/lạng/gram. |
| `backend/supabase/migrations/202610050026_seed_weight_units.sql` | `save_product` chấp nhận gram gốc chỉ đo tồn, kiểm tra đúng hệ số cân; giữ admission/khóa/quyền cũ. |
| `tests/seed-weight.test.js`, `backend/supabase/tests/seed_weight.test.sql` | Kiểm thử JS và nghiệp vụ/RLS trên PostgreSQL. |

## Kiểm tra đạt

8 kiểm thử JS riêng cho Hạt và 36 assertion pgTAP riêng: 5 kg bán 1,5 kg còn 3.500 gram; giá/kg độc lập; COGS/lãi; retry nhập/bán/hủy; bán cùng kg/lạng; rollback khi vượt tồn; chặn lượng nhỏ hơn 1 gram; hủy mixed-unit giữ nguyên hao hụt; kiểm kê/giá trị hao hụt; tenant isolation; lạng cũ/CSV cũ; backup demo; giỏ cloud không tự trừ tồn; CSV gram trái cây vẫn dùng receipt kg.

Tổng bộ dự án: 112 JS tests, 389 pgTAP assertions, 31 migration và kiểm tra concurrency đạt. Build/lint đạt. PostgreSQL tạm đã dừng; Auth/PostgREST/Edge thực tế cần kiểm chứng trên Supabase khi người dùng chủ động mở Docker.
