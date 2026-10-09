# Giới hạn thao tác quản trị

Cập nhật 05/10/2026. Đã có mã nguồn và kiểm tra PostgreSQL tạm; chưa áp migration/serve Edge mới trên Supabase của cửa hàng. Không tự khởi động Docker.

## Luồng xử lý

`Admin Page → adminApi → Edge xác minh JWT + Admin active + AAL2 → parseAction → admin_admit_action → RPC nghiệp vụ / Supabase Auth`.

Admission là một RPC riêng, commit trước khi thực hiện nghiệp vụ. Thao tác phía sau thất bại vẫn tiêu thụ hạn mức đã nhận. Nếu RPC giới hạn lỗi hoặc trả dữ liệu không hợp lệ, Edge dừng trước mọi thay đổi hoặc gửi email.

## Hạn mức

Mỗi Admin có cửa sổ trượt 60 giây, dùng thời gian PostgreSQL sau khi lấy khóa:

| Phạm vi | Hạn mức |
| --- | --- |
| Tổng yêu cầu mới: trạng thái shop/user, quyền Admin, reset mật khẩu | 10 / 60 giây |
| Yêu cầu mới thay đổi quyền Admin | 3 / 60 giây, nằm trong tổng 10 |
| Tổng lần gọi hợp lệ, kể cả retry hoặc bị từ chối vì hết hạn mức yêu cầu mới | 30 / 60 giây |

Khóa advisory theo actor bảo đảm nhiều Edge instance không cùng vượt hạn mức. Hai Admin có hạn mức độc lập. Đây là giới hạn thao tác của tài khoản Admin đã được xác thực, không phải giải pháp chống DDoS, giới hạn IP hay giới hạn đăng nhập public. Các biện pháp Auth/upstream vẫn cần cấu hình theo môi trường triển khai.

Reset mật khẩu còn giữ claim/lease và hạn mức theo người nhận từ migration `...019`; lớp mới không bỏ kiểm tra đó.

## Retry và lưu dữ liệu

`(actor_id, request_id)` gắn cố định với hash SHA-256 của action, target, trạng thái/quyền và lý do đã trim. Retry cùng nội dung không chiếm thêm slot yêu cầu mới, nhưng vẫn chiếm slot lần gọi. Đổi nội dung với ID cũ bị từ chối, kể cả sau khi cửa sổ giới hạn hết hạn.

Admission không xác nhận nghiệp vụ đã thành công. RPC nghiệp vụ tiếp tục kiểm tra quyền/trạng thái hiện tại và chống ghi trùng bằng request ID. Nếu admission thành công rồi mất kết nối, thử lại ID đó sẽ đi tiếp hoặc lấy kết quả nghiệp vụ đã commit; không tạo ID mới chỉ vì lỗi mạng.

Hai bảng private `admin_action_admissions` và `admin_action_rate_windows` bật RLS, thu hồi Data API grants cho cả browser lẫn service role. Chỉ RPC security definer có quyền đọc/ghi; RPC chỉ cấp EXECUTE cho service role trong Edge. Không lưu plaintext lý do trong admission; không lưu payload kinh doanh, email, password hoặc key. Journal admission giữ hash/UUID lâu dài để phát hiện ID tái sử dụng; không xóa journal chỉ để làm trống rate window. Cửa sổ attempt lưu tối đa 30 timestamp mỗi actor, tự loại timestamp hết hạn khi gọi tiếp.

## Khi bị giới hạn

Edge trả HTTP `429`, `Retry-After` và JSON `retryAfter` (1–60 giây). Dialog hiển thị thời gian chờ và giữ request ID; người dùng chủ động thử lại. Không tự gọi lại thao tác nguy hiểm. `adminApi` giữ `status` và `retryAfter` trên Error cho UI mở rộng sau này.

Mỗi actor tối đa một sự kiện `ADMIN_RATE_LIMITED` mỗi 60 giây khi thực sự bị từ chối. Trang Bảo mật có bộ lọc này. Không ghi audit thành công cho admission; không giả lập failed-login/Auth event.

## File đảm nhiệm

| File | Trách nhiệm |
| --- | --- |
| `backend/supabase/migrations/202610050024_admin_action_rate_limits.sql` | Bảng private, cửa sổ trượt, khóa, intent hash, observed security event. |
| `backend/supabase/functions/admin-api/actions.js` | Validate → admission → execution; fail closed và lỗi rate limit. |
| `backend/supabase/functions/admin-api/index.js` | JWT/MFA, gọi executor, phản hồi 429/CORS Retry-After. |
| `src/admin/services/adminApi.js` | Bảo toàn status/cooldown; không tự retry. |
| `src/admin/components/AdminActionDialog.jsx` | Request journal qua reload, xác nhận/lý do, thông báo lỗi. |
| `backend/supabase/tests/admin_action_rate_limits.test.sql` | 30 assertion: quyền, hạn mức, retry, nội dung thay đổi, cửa sổ hết hạn, sự kiện thật. |
| `tests/admin-api-validation.test.js` | Denial/malformed/unavailable không gọi execution; thứ tự admission trước mutation. |
| `scripts/validate-postgres-concurrency.mjs` | Hai kết nối tranh slot cuối chỉ một được nhận; retry không tạo admission thứ hai. |

## Triển khai khi chủ động mở môi trường

Áp migration `...024` trước khi cập nhật/serve `admin-api`. Edge mới sẽ dừng mọi action nếu chưa có RPC admission. Xem `ADMIN_BOOTSTRAP.md` cho cấu hình JWT/MFA/origin; không cần thêm `VITE_*` hoặc đưa key server vào frontend.

Kiểm tra thực tế tiếp theo: Admin AAL2 gửi đủ yêu cầu để nhận 429/Retry-After qua HTTP, xác nhận action bị chặn không đổi dữ liệu hoặc gọi Auth; chờ hết cửa sổ rồi thử lại cùng request ID. Các test hiện tại không thay thế kiểm tra Auth/HTTP/Edge trên Supabase.
