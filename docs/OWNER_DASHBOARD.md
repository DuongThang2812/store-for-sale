# Dashboard chủ tiệm và báo cáo lợi nhuận

Cập nhật 05/10/2026. Dashboard đã áp vào Supabase local và kiểm tra qua Auth/PostgREST thật; xem [nghiệm thu local](LOCAL_SUPABASE_ACCEPTANCE.md).

## Dữ liệu và quyền

`HomePage → useOwnerDashboard → reportService.getDashboard → shop_dashboard → PostgreSQL`.

Migration `backend/supabase/migrations/202610050027_owner_dashboard.sql` thêm một RPC chỉ đọc, chỉ chủ tiệm có thành viên/tài khoản active được gọi. Staff, tenant khác, tài khoản disabled và anon bị chặn tại DB. Cửa hàng suspended được đọc báo cáo, còn mọi nghiệp vụ ghi vẫn chịu admission đã có. Admin không được tự xem báo cáo cửa hàng qua quyền Platform Admin.

`shop_dashboard` dùng lại `management_report(store, 1)` để không nhân đôi logic doanh thu/thu nợ/hủy/COGS. Cả hai là hàm `STABLE`: các mục của một lần đọc dùng cùng snapshot của câu lệnh. Không ghi tiền/kho/nợ, không lấy số dư từ client. Ngày báo cáo theo timezone cửa hàng `Asia/Ho_Chi_Minh`.

## Trang chủ

- Tạp hóa: tiền thực thu, nợ và số khách nợ từ DB; doanh thu, COGS, lợi nhuận gộp, số đơn còn hiệu lực hôm nay; số mặt hàng sắp hết và hết hàng; top mặt hàng theo doanh thu; hàng tồn nhiều; phiếu nhập gần đây.
- Trái cây: cùng số liệu tài chính/kho, thêm số lượng và giá trị hư/thối hôm nay. Số lượng nhóm theo đơn vị gốc; gram hiển thị kg, quả/trái/hộp giữ đúng đơn vị. Không cộng kg với số trái.
- Top bán chạy hiện tối đa 5 hàng, sắp hết tối đa 5, tồn nhiều và phiếu nhập tối đa 10. Số đếm tổng do DB tính trên toàn bộ cửa hàng, không đếm một trang dữ liệu. Hàng tồn nhiều xếp riêng theo đơn vị gốc, phân bổ danh sách theo thứ hạng từng nhóm; không so sánh gram với lon.
- Phiếu nhập chỉ có ID, thời gian, tổng tiền, số dòng và tên nhà cung cấp. Không trả địa chỉ/điện thoại/note của nhà cung cấp.
- Hư/thối chỉ gồm movement âm loại `adjustment`, mã lý do `spoiled`, trong `[00:00 hôm nay, 00:00 ngày sau)` tại timezone cửa hàng. `lost`, `damaged`, `personal_use`, chênh lệch kiểm kê và ghi chú có chữ “spoiled” không tự trở thành hư/thối.
- Giá trị hư/thối dùng `inventory_adjustment_valuations.loss_value` chụp tại thời điểm điều chỉnh. Nhập hàng sau đó không định giá lại lịch sử. Một movement chưa đủ giá vốn khiến tổng giá trị là `NULL` và có số lần thiếu vốn, thay vì tổng thiếu được trình bày như tổng đầy đủ.
- Giữ luồng và nút Bán hàng/Nhập hàng/Sổ nợ/Kho. Demo tiếp tục hiển thị số liệu local như trước; không gọi Supabase khi dùng demo.

Phản hồi chỉ được hiển thị trong đúng phiên xác thực, cửa hàng, role, lần tải và phiên bản dữ liệu. Đổi shop, logout/login lại cùng UUID, đổi role hoặc tải lại không được dùng báo cáo cũ. Có trạng thái đang tải/lỗi và nút thử lại/cập nhật số liệu; không hiển thị số mẫu. Cập nhật khi nạp lại dữ liệu cửa hàng hoặc bấm cập nhật, chưa phải realtime giữa nhiều máy.

## Báo cáo và Admin

`RevenuePage` thêm tỷ suất lợi nhuận gộp từ `gross_margin_percent` do PostgreSQL tính. Khi thiếu COGS hoặc doanh thu bằng 0, tỷ suất để trống với giải thích. Mapper từ chối số không hữu hạn, trường bị thiếu, số nguyên vượt độ chính xác và ngày không hợp lệ. CSV báo cáo cloud thêm COGS/lợi nhuận, giữ ô trống khi chưa đủ vốn.

Dashboard Admin dùng cùng component tình trạng hệ thống với `/admin/system`, đọc API `system` riêng. Database phản ánh truy vấn thành công, Auth phản ánh JWT/AAL2 đã xác minh, Edge phản ánh yêu cầu thực vừa xử lý. Có thời gian kiểm tra, không tạo uptime giả; lỗi riêng của mục này không che mất các số liệu dashboard khác.

## File đảm nhiệm

| File | Vai trò |
| --- | --- |
| `backend/supabase/migrations/202610050027_owner_dashboard.sql` | Aggregate DB, quyền và snapshot báo cáo |
| `src/services/reportService.js` | Gọi RPC, không tự tính số dư |
| `src/mappers/reportMapper.js` | Snake_case → camelCase, số/ngày/giới hạn dữ liệu |
| `src/domain/reportScope.js`, `src/hooks/useOwnerDashboard.js` | Chặn response khác phiên/shop/role/lần tải |
| `src/pages/home/HomePage.jsx`, `OwnerDashboard.jsx` | Giữ thao tác cũ, hiển thị dashboard owner |
| `src/pages/RevenuePage.jsx`, `src/utils/reportDisplay.js` | Tỷ suất, CSV và định dạng đơn vị/timezone |
| `src/admin/components/AdminSystemHealth.jsx`, `src/admin/pages/AdminPages.jsx` | System Health trên dashboard và trang System |
| `tests/dashboard-report.test.js` | 6 kiểm tra service/mapper/phạm vi/hiển thị |
| `backend/supabase/tests/owner_dashboard.test.sql` | 32 assertion DB: số liệu, snapshot, timezone, giới hạn, quyền |

## Kiểm tra

141/141 JS tests và 504/504 pgTAP assertions đạt; 33 migration đã áp vào Supabase local. Lint/build đạt. Lần PostgreSQL tạm trước có 487 assertions và concurrency đạt; log `C:/Users/user/AppData/Local/Temp/taphoa-sql-validation-rNZjkw`, cluster đã dừng. Dữ liệu kinh doanh hiện có được giữ nguyên.

Tổng SQL gồm 32 assertion riêng của dashboard và 34 assertion mới đối chiếu các ví dụ số trong yêu cầu tại `acceptance_examples.test.sql`; Hạt 5 kg bán 1,5 kg còn 3,5 kg đã có trong `seed_weight.test.sql`.

Auth/PostgREST/Edge local đã được nghiệm thu, gồm báo cáo vốn/lãi/tiền thu/hủy và hao hụt. Giao diện trình duyệt và production còn chờ. Áp migration bằng `npm run db:migrate`, không dùng reset để cập nhật DB hiện có.
