# Chuyển dữ liệu nghiệp vụ lên Supabase — kiểm kê hiện trạng và kế hoạch an toàn

> **Cập nhật:** phần dưới giữ cuộc kiểm kê ban đầu. Các trang chính hiện đã nối cloud; wizard legacy và kiểm kê đã có UI. Xem [CLOUD_IMPLEMENTATION_STATUS.md](./CLOUD_IMPLEMENTATION_STATUS.md) cho hiện trạng và kiểm tra đã chạy. Không dùng các câu “chưa nối cloud” bên dưới làm kết luận hiện tại.

Ngày kiểm kê: 2026-10-05. Tài liệu này ghi nhận trạng thái mã nguồn tại thời điểm bắt đầu chuyển dữ liệu. Đây không phải chứng nhận các phase đã hoàn thành.

## CURRENT STATE

| Phần | Nguồn dữ liệu hiện tại | Ghi chú |
| --- | --- | --- |
| Auth, phiên, cửa hàng, thành viên | Supabase Auth, `stores`, `store_members` | RBAC owner/staff và `business_type` đã có. |
| Danh mục, nhà cung cấp, danh mục giá Excel | Supabase | RPC ghi có kiểm tra cửa hàng. |
| Hàng hóa dùng khi bán và xem kho | `useShopStore` + `localStorage` | `product_catalog`/repository đọc cloud đã có nhưng chưa nối trang chính. |
| Khách, giỏ mua chịu, trả nợ | `useShopStore` + `localStorage` | DB có bảng và RPC nhưng UI chưa dùng. |
| Bán, nhập, hủy đơn, hao hụt, lịch sử | `useShopStore` + `localStorage` | RPC DB tồn tại; trang chính vẫn cập nhật local đồng bộ. |
| Doanh thu, dashboard, JSON backup | Tính từ bản local | Chưa có RPC báo cáo; backup hiện chỉ chứa dữ liệu trên thiết bị. |

Schema đã có `products`, `product_units`, `customers`, `sales`, `sale_items`, `stock_receipts`, `stock_receipt_items`, `stock_movements`, `debt_payments`, `payment_allocations`, `audit_logs`, `categories`, `suppliers`, `product_batches`, cùng các bảng nhập danh mục giá. `product_catalog` và `customer_debt_summary` là view đọc. Tiền giao dịch là VND nguyên (`bigint`); tồn là số nguyên theo đơn vị gốc, trái cây theo gram; số lượng giao dịch cân dùng `numeric(14,3)`. Các RPC `create_sale`, `receive_stock`, `record_debt_payment`, `cancel_sale`, `adjust_stock` ghi atomically, có kiểm tra membership/role; các lệnh ghi trực tiếp qua Data API bị khóa. Chưa có giá vốn chốt theo dòng bán, bình quân giá vốn, kiểm kê, báo cáo server hay cơ chế chuyển lịch sử local.

Rủi ro phải xử lý trước khi bật cloud cho nghiệp vụ: dữ liệu local và cloud có thể lệch; mẫu hàng/khách trong `useShopStore` không phải dữ liệu thật; ngắt mạng sau commit có thể làm người dùng bấm lại; hóa đơn cũ có thể thiếu `items`/quy đổi; khách có số nợ ban đầu nhưng không có đơn hàng; nhập lại backup có thể nhân đôi; tồn hiện tại là ảnh chụp cuối kỳ nên không được phát lại toàn bộ nhập/bán lịch sử để tính tồn lần nữa.

## Chiến lược backup và chuyển dữ liệu

1. Chỉ đọc khóa `little-store-local:<auth-user-id>:<store-id>` của tài khoản và cửa hàng đang được Supabase xác thực. Không lấy khóa của shop khác, không tự nhập dữ liệu từ `little-store-signed-out` và không tự chuyển khi đăng nhập.
2. Kiểm tra cấu trúc bằng `validateSnapshot`; xác định version của Zustand và version backup. Chạy preflight không ghi DB: đếm sản phẩm, khách, đơn có/không có chi tiết, trả nợ, hủy, nhập kho, hao hụt; đối chiếu tổng nợ khách với lịch sử phân bổ và xác định ID trùng/tham chiếu thiếu.
3. Tạo bản sao JSON có checksum SHA-256 và tải về **trước** thao tác ghi cloud. Người dùng chọn đúng shop đích; wizard hiển thị số liệu và những dòng không thể chuyển nguyên vẹn.
4. Dùng `migration_id`/hash của snapshot, `legacy_id` có unique theo cửa hàng và RPC nhập từng đợt có transaction. Retry dùng cùng request ID; lần chạy thứ hai chỉ trả kết quả đã ghi. Mỗi đợt xác minh count/tổng tiền/số dư/tồn bằng query DB trước khi đánh dấu hoàn thành.
5. Nhập **tồn hiện tại** như số dư mở đầu kèm stock movement `opening`/định giá mở đầu nếu biết chắc. Dữ liệu lịch sử dùng để xem/đối chiếu, không được phát lại các biến động tồn đã phản ánh trong số dư hiện tại.
6. Đơn cũ có đủ dòng và giá có thể chuyển thành hóa đơn legacy với snapshot. Đơn thiếu dòng/quy đổi, khoản nợ mở đầu và hoạt động không thể tái tạo chính xác phải vào lịch sử legacy có nhãn rõ; không tự chế `sale_item`/giá vốn. Khoản nợ mở đầu cần bút toán phải thu riêng để RPC trả nợ theo thứ tự cũ. Giá vốn legacy không rõ phải để `NULL` và báo cáo thể hiện "chưa đủ dữ liệu giá vốn".
7. Giữ nguyên localStorage và file backup sau khi hoàn tất. Đánh dấu trạng thái migrated theo đúng user/shop/snapshot, không xóa tự động. Cloud mode chỉ bật khi kiểm chứng tổng hợp đạt yêu cầu; lỗi giữa chừng không được hiển thị như đã chuyển xong.

## Thứ tự triển khai còn lại

1. Hoàn thiện migration schema cho dấu vết legacy, giá vốn bình quân, kiểm kê, báo cáo và quyền xem số liệu tài chính.
2. Kết nối product/category/customer read-write với cloud; nạp theo trang, có loading/error/retry và không chèn dữ liệu mẫu vào shop mới.
3. Kết nối nhập kho, bán hàng, trả nợ, hủy đơn, hao hụt qua RPC; khóa nút khi gửi, giữ cùng `request_id` khi retry, đọc lại trạng thái đã commit trước khi báo thành công.
4. Tạo wizard chuyển dữ liệu với preflight, backup, nhập theo batch, reconciliation và test chạy lại không trùng.
5. Bổ sung weighted-average COGS và snapshot tại `sale_items`; đảo doanh thu/COGS khi hủy; giá trị hao hụt; kiểm kê có lịch sử.
6. Dashboard/revenue đọc aggregate phía PostgreSQL theo múi giờ cửa hàng, owner-only cho giá vốn/lãi/hao hụt; test RLS trực tiếp và UI.
7. Sau cùng chạy SQL integration tests, JS tests, build, lint và kiểm tra thủ công grocery/fruit_shop.

Không đổi chế độ lưu dữ liệu của shop đang dùng cho tới khi đường chuyển và đối chiếu dữ liệu hoạt động. Mọi bước schema dùng migration mới, không reset/drop dữ liệu thực.

## Tiến độ sau kiểm kê

- `202610050001_cost_inventory_count.sql`: thêm snapshot giá vốn ở dòng bán, bình quân gia quyền theo đơn vị gốc khi nhập, phục hồi giá vốn khi hủy, lịch sử kiểm kê và định giá hao hụt chỉ chủ tiệm đọc được.
- `202610050002_opening_cost.sql`: cho chủ tiệm định giá một lần tồn cũ chưa rõ vốn; dữ liệu chưa được định giá giữ `NULL`, không giả lợi nhuận bằng 0. Giá trị đã chốt ở đơn cũ không thay đổi.
- `202610050003_management_report.sql`: thêm báo cáo tổng hợp phía PostgreSQL theo múi giờ cửa hàng, chỉ chủ tiệm được xem doanh thu, tiền thu, công nợ, giá vốn, lợi nhuận gộp, hàng sắp hết và hao hụt. `reportService.js` đã gọi RPC này, nhưng trang Doanh thu chưa dùng service.
- `legacyMigration.js`: đọc đúng khóa của tài khoản/cửa hàng hiện tại, kiểm tra version và đối chiếu nợ; tạo backup có checksum trước khi triển khai wizard ghi DB.
- Các RPC/service mới đã có lớp gọi nhưng trang bán, nhập, nợ, kiểm kê và báo cáo **chưa nối cloud**. Chưa có RPC nhập lịch sử local hoặc công tắc chuyển cloud an toàn. Không xem tài liệu này là xác nhận hoàn tất Phase 3–11.
