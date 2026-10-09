# Chi tiết cửa hàng và tài khoản trong Admin

Cập nhật 05/10/2026. Đã triển khai mã và kiểm tra PostgreSQL tạm; chưa áp migration hoặc chạy Edge/MFA/HTTP trên Supabase của cửa hàng.

## Trang cửa hàng

`/admin/shops/:id` có header tên/loại/trạng thái và thao tác tạm khóa, mở lại, lưu trữ như trước. Các tab:

| Tab | Dữ liệu |
| --- | --- |
| Tổng quan | Chủ/email chủ, ngày tạo, số thành viên active, số hàng, lần hoạt động gần nhất, UUID cửa hàng. |
| Thành viên | Tên/email, vai trò, membership active/inactive, trạng thái tài khoản, quyền bán/nhập/nợ. |
| Hoạt động nền tảng | Audit quản trị nhắm vào cửa hàng này: actor, action, thời gian, lý do. |
| Bảo mật | Sự kiện thực sự ghi nhận có target cửa hàng, gồm các thao tác Admin và rate denial. |

Tab dùng bàn phím trái/phải, Home/End, `aria-selected` và `tabpanel`. Chỉ tab đang mở nạp danh sách; mỗi lần tối đa 20 dòng, có Trước/Sau/Tải lại. Tab Thành viên là đọc metadata, không cho Platform Admin tự tham gia hoặc nhận quyền cửa hàng.

Không có tab khách hàng, đơn bán, công nợ hoặc tài chính. `last_activity_at` đọc timestamp audit cửa hàng, không trả payload nghiệp vụ.

## Trang tài khoản

`/admin/users/:id` có hồ sơ/trạng thái/UUID, cửa hàng tham gia, thông tin xác thực, sự kiện bảo mật và thao tác Admin nhắm vào tài khoản/quyền Platform Admin của tài khoản. Memberships, security và activity đều phân trang riêng, không nhúng toàn bộ danh sách trong hồ sơ.

Thông tin xác thực gọi `auth.admin.getUserById()` tại Edge sau xác minh Admin/AAL2. Chỉ trả `email_confirmed_at` và `last_sign_in_at`; loại bỏ toàn bộ provider User object, identities, factors, app/user metadata. Auth không phản hồi hoặc trả user khác ID thì `available:false`, UI báo chưa lấy được thông tin, không đoán tài khoản đã xác nhận. Đây là snapshot quan sát, không phải uptime hoặc lịch sử đăng nhập đầy đủ. Trạng thái quyền truy cập vẫn lấy từ `profiles.account_status` và guard DB/RLS.

Đổi `:id` sẽ remount tab/dialog/page state; response cũ còn được chặn bởi hook user/request scope. Xác nhận đang mở cho tài khoản/cửa hàng cũ không được giữ để tác động vào đối tượng mới.

## Backend và bảo mật

`Page → adminApi → Admin Edge → createAdminReader → admin_read_detail → PostgreSQL`.

RPC chỉ service role được EXECUTE, kiểm tra active Admin actor, target UUID, resource allowlist, phân trang 1–100, offset tối đa 1.000.000, sort mới/cũ trước pagination và tie-break ID. Không có sort SQL tùy ý. Parent không tồn tại trả null → HTTP 404, không tạo dữ liệu trống giả cho parent không có.

Related lists khóa theo target và đúng loại đối tượng. Security metadata trả theo whitelist audit_id/target_type/target_id/action/limit; không copy raw metadata của provider hoặc business payload. RPC không đọc dòng customer/sales/debt/cost.

RPC `admin_read` và `admin_read_filtered` cũ giữ nguyên cho client đã triển khai. Edge mới chuyển tám resource detail sang `admin_read_detail`; nếu cập nhật Edge phải áp migration `...025` trước. Đọc user nội bộ cho reset/đồng bộ trạng thái chỉ lấy DB metadata, không gọi thêm Auth summary.

## File đảm nhiệm

| File | Nhiệm vụ |
| --- | --- |
| `src/admin/pages/AdminDetailPages.jsx` | Tab shop, sections user, bảng/pagination dùng chung, dialog giữ request journal. |
| `src/admin/pages/AdminPages.jsx` | Export tương thích route hiện có; giữ Dashboard/System/Settings. |
| `backend/supabase/functions/admin-api/validation.js` | Resource/target/limit/sort và chặn filter detail không hỗ trợ. |
| `backend/supabase/functions/admin-api/reads.js` | Chọn RPC detail/list và bổ sung Auth summary cho user read bên ngoài. |
| `backend/supabase/functions/admin-api/authSummary.js` | Whitelist provider response và tách trạng thái unavailable. |
| `backend/supabase/migrations/202610050025_admin_detail_reads.sql` | Summary metadata, related pagination, index security target. |
| `backend/supabase/tests/admin_detail_reads.test.sql` | 27 assertion về quyền, target scope, privacy, pagination, sort và parent thiếu. |
| `tests/admin-api-validation.test.js` | Dispatch RPC bounded, validation target, Auth privacy/failure/not-found. |

## Kiểm chứng còn lại

Kiểm tra browser/MFA, tab bằng bàn phím, điều hướng từ shop/user A sang B, 404, Auth unavailable, phân trang hơn 20 thành viên và đồng bộ sau action trên Supabase thực khi chủ động mở Docker. Kết quả SQL và mock SDK hiện có không chứng minh các bước này đã chạy trên môi trường thật.
