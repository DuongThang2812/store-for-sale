# Danh sách, bộ lọc và nhật ký quản trị

Cập nhật 05/10/2026. Migration `202610050023_admin_filtered_reads.sql` và mã Edge/React đã có. Đã kiểm tra SQL riêng; chưa áp lên Supabase đang dùng hoặc chạy HTTP/Edge mới nhất vì Docker giữ tắt.

## Chức năng

| Trang | Tìm kiếm và bộ lọc | Sắp xếp |
| --- | --- | --- |
| `/admin/shops` | Tên tiệm, chủ, email chủ; trạng thái và loại kinh doanh riêng; ngày tạo | Mới/cũ; tên A–Z/Z–A |
| `/admin/users` | Tên/email; active/disabled/owner/staff; ngày tạo | Mới/cũ; tên A–Z/Z–A |
| `/admin/admins` | Tên/email; active/disabled; ngày cấp quyền | Mới/cũ; tên A–Z/Z–A |
| `/admin/audit-logs` | Hành động/lý do; UUID Admin; hành động chính xác; loại đối tượng; ngày | Mới/cũ |
| `/admin/security` | Loại sự kiện; UUID người dùng; ngày | Mới/cũ |

Nhấn **Áp dụng** sau khi chọn bộ lọc. **Xóa bộ lọc** quay về danh sách ban đầu; **Tải lại dữ liệu** nạp trạng thái mới với bộ lọc đang áp dụng. Mỗi trang lấy 20 dòng; RPC chỉ nhận giới hạn 1–100. Tổng số dòng là tổng **sau lọc**, không phải tổng toàn bảng. Trang rỗng vẫn có thể trở về trước nếu dữ liệu thay đổi.

Ngày dùng `Asia/Ho_Chi_Minh`: từ ngày 05/10 đến hết ngày 05/10 là khoảng UTC `[04/10 17:00, 05/10 17:00)`. Không bỏ các giao dịch buổi tối và không lấy nhầm giao dịch đầu ngày tiếp theo. Ngày không tồn tại, khoảng đảo ngược và UUID không hợp lệ bị chặn trước request.

Nhật ký có tên Admin, đối tượng, lý do và hộp chi tiết Before/After. Nội dung hiển thị bằng React text/JSON, không dùng HTML từ dữ liệu. Danh sách shop/user chỉ trả metadata nền tảng; không bổ sung khách, đơn mua hàng, công nợ hoặc lợi nhuận shop.

Sự kiện bảo mật lấy từ các sự kiện đã được backend ghi nhận. Không tạo số liệu LOGIN_FAILED hoặc MFA_FAILED nếu chưa có nguồn tin cậy.

## Luồng và file

`React Admin Page → adminApi → verified JWT/AAL2 → createAdminReader → admin_read_filtered → PostgreSQL`.

| File | Nhiệm vụ |
| --- | --- |
| `src/admin/pages/AdminListPages.jsx` | Shops, Users, Admins, Security, Audit với bảng/phân trang dùng chung. |
| `src/admin/components/AdminData.jsx` | Bảng, bộ lọc, trạng thái, phân trang, loading/error/empty. |
| `src/admin/hooks/useAdminData.js` | Nạp theo bộ lọc hiện tại; loại response cũ sau đổi bộ lọc/phiên. |
| `src/admin/hooks/useAdminListFilters.js` | Draft → kiểm tra → áp dụng; reset trang về đầu khi đổi điều kiện. |
| `src/admin/domain/listFilters.js` | Chuyển ngày Việt Nam thành mốc UTC, kiểm tra UUID. |
| `backend/supabase/functions/admin-api/validation.js` | Allowlist resource/filter/sort, UUID, độ dài, timestamp có múi giờ. |
| `backend/supabase/functions/admin-api/reads.js` | Chuyển input đã kiểm tra sang đầy đủ tham số RPC, gồm ngày/Admin/hành động. |
| `backend/supabase/migrations/202610050023_admin_filtered_reads.sql` | SQL lọc/sắp xếp/phân trang có thứ tự ổn định và chỉ service-role được gọi. |
| `src/admin/components/AdminActionDialog.jsx` | Xác nhận/lý do, không đóng khi đang gửi; journal giữ ID khi retry qua reload. |

SQL chỉ sắp xếp bằng CASE trên giá trị allowlist; không ghép chuỗi SQL từ tên cột người dùng gửi. `admin_read` cũ giữ cho API đã triển khai; Edge mới dùng `admin_read_filtered`. Browser không có quyền execute cả hai RPC bằng key công khai.

Trang System nêu riêng DB query thành công, Auth đã xác minh phiên của request hiện tại và Edge đã trả kết quả. Đây là kiểm tra tại thời điểm yêu cầu, không phải số uptime hoặc health toàn dịch vụ được đo liên tục.

## Kiểm tra

`backend/supabase/tests/admin_filtered_reads.test.sql`: 24 assertions, gồm kết hợp filter, sort trước limit, offset, ngày Việt Nam, actor/action filter, privacy, chặn SQL sort tùy ý và quyền service-role. `tests/admin-api-validation.test.js` kiểm tra từ ngày UI đến tham số RPC.

Toàn bộ hiện tại: **85 kiểm tra JS, 265 pgTAP assertions, 28 migration** đạt trên PostgreSQL tạm, cùng concurrency. Build/lint đạt. SQL dùng `auth.uid()` mô phỏng; HTTP/Edge/Auth thật còn cần kiểm tra trên Supabase.

## Áp dụng khi chủ động mở môi trường

1. Sao lưu dữ liệu, kiểm tra đúng môi trường rồi áp migration **trước** cập nhật Edge để RPC mới tồn tại.
2. Với local đã mở Docker: chạy `npm run db:start`, `npm run db:migrate`, `npm run db:test` từ thư mục gốc.
3. Serve/cập nhật `admin-api` từ `backend` theo `ADMIN_BOOTSTRAP.md`; giữ khóa server ngoài `VITE_*`.
4. Thử AAL1 bị từ chối, AAL2 đọc được; shop owner thường bị từ chối; chạy bộ lọc ngày với sự kiện sát nửa đêm Việt Nam.

Chưa tự bật Docker, áp migration vào DB thật hoặc deploy Edge trong lần thực hiện này. Rate limit tổng quát cho grant/disable/suspend vẫn là mục còn lại; password reset đã có rate limit/lease riêng.
