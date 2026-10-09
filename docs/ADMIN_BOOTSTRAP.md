# Khởi tạo Platform Admin và triển khai cổng quản trị

Platform Admin là quyền riêng của nền tảng, không phải vai trò `owner` của cửa hàng. Ứng dụng không có nút đăng ký Admin công khai. Người khởi tạo đầu tiên cần quyền tin cậy trên dự án Supabase.

1. Tạo một tài khoản thường qua màn hình đăng ký, xác nhận email, rồi lấy UUID của tài khoản trong Supabase Dashboard → Authentication → Users.
2. Trong SQL Editor của **đúng dự án**, sau khi đã áp dụng toàn bộ migration hiện có (hiện đến `202610050028_catalog_purchase_privacy.sql`), chạy câu lệnh dưới đây bằng quyền quản trị DB. Thay UUID bằng UUID vừa kiểm tra. Không đặt câu SQL này vào frontend hoặc cho người dùng tự chạy:

   ```sql
   insert into public.platform_admins (user_id, admin_role, is_active)
   values ('UUID-CỦA-TÀI-KHOẢN'::uuid, 'platform_admin', true)
   on conflict (user_id) do nothing;
   ```

3. Trong Supabase Authentication → MFA, bật TOTP enrollment và verification. Cấu hình local đã bật trong `backend/supabase/config.toml`.
4. Cấu hình `ADMIN_ALLOWED_ORIGINS` là các origin frontend chính xác, ngăn cách bằng dấu phẩy, ví dụ `https://bin.example.com`. Nếu gửi email đặt lại mật khẩu từ tác vụ Admin không có `Origin`, đặt thêm `ADMIN_PUBLIC_APP_ORIGIN` bằng origin chính thức. Thêm URL `/reset-password` tương ứng vào Auth redirect allowlist.
5. Deploy `backend/supabase/functions/admin-api`. Chỉ Edge Function dùng `SUPABASE_SERVICE_ROLE_KEY` ở môi trường server; frontend chỉ dùng `VITE_SUPABASE_URL` và publishable/anon key. Để `verify_jwt = true` như trong cấu hình.
6. Đăng nhập tài khoản vừa cấp quyền, mở `/admin`, đăng ký TOTP bằng ứng dụng xác thực, xác minh mã rồi vào trang quản trị. Mọi lần đọc/sửa Admin sau đó cần phiên AAL2. Thao tác nguy hiểm yêu cầu lý do, xác nhận rõ và được ghi vào `admin_audit_logs`.

Lệnh triển khai mẫu khi đứng ở thư mục `backend`:

```powershell
npx supabase migration up --linked
npx supabase secrets set ADMIN_ALLOWED_ORIGINS=https://bin.example.com ADMIN_PUBLIC_APP_ORIGIN=https://bin.example.com --project-ref <project-ref>
npx supabase functions deploy admin-api --project-ref <project-ref>
```

Trước triển khai production: sao lưu database, rà lại RLS/RPC, kiểm tra domain và redirect, rồi thử bằng tài khoản Admin và tài khoản thường. Các lệnh có `--linked`/`--project-ref` cần trỏ đúng dự án; không chạy nếu chưa đối chiếu. Không dùng `db reset` trên dữ liệu thật.

Supabase Auth và PostgreSQL không chung một transaction. Khóa/mở tài khoản chốt `profiles.account_status` và audit trước; RLS chặn tài khoản disabled ngay cả khi JWT cũ còn hiệu lực. Edge đồng bộ ban/unban Auth theo trạng thái DB **hiện tại**, kể cả khi thử lại request cũ. Nếu Auth lỗi, DB không bị hoàn tác về trạng thái cũ; thử lại cùng request để đồng bộ và đối chiếu Auth/DB. Hai yêu cầu quản trị đối nghịch chạy đồng thời vẫn cần đối chiếu trạng thái Auth sau cùng; đây không phải một transaction xuyên hai hệ thống.

Email đặt lại mật khẩu có claim/lease và trạng thái gửi trong `admin_reset_deliveries`: hai request đồng thời không cùng gửi; gửi thành công rồi retry sẽ không gửi nữa; lỗi gửi được đánh dấu để thử lại sau thời gian chờ. Nếu Edge chết sau khi Auth đã gửi nhưng trước khi đánh dấu sent, lần thử sau lease có thể gửi thêm một email. Audit xác nhận yêu cầu và trạng thái Auth chấp nhận gửi, không chứng minh email đã đến hộp thư.

Edge mới dùng RPC `admin_read_filtered`, `admin_read_detail` và `admin_admit_action`: áp migration trước khi cập nhật/serve Edge. Xem `ADMIN_LIST_FILTERS.md` cho bộ lọc/ngày và `ADMIN_RATE_LIMITS.md` cho hạn mức dùng chung, retry và HTTP 429. Nếu RPC admission chưa có/lỗi, Edge dừng action trước mutation/Auth.

Chi tiết cửa hàng/tài khoản có các danh sách phân trang riêng và Auth summary whitelist tại Edge. Xem `ADMIN_DETAIL_PAGES.md`; không trả provider User object cho frontend.
