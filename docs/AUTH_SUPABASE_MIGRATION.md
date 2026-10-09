# Supabase Auth cho Tạp hóa BIN

## Trạng thái

`/login` dùng `supabase.auth.signInWithPassword`, `/reset-password` dùng recovery của Supabase Auth. Không còn đường đăng nhập mẫu trong app. Trang nghiệp vụ chỉ hiện sau khi có session, `getUser()` xác minh với Auth server, và cửa hàng được tải qua `store_members` có RLS. Người mới tạo cửa hàng bằng RPC `create_store`; có nhiều cửa hàng thì chọn một.

**Giới hạn quan trọng:** Bán hàng, giỏ hàng, nhập kho, nợ, lịch sử, doanh thu và JSON backup vẫn chạy trên Zustand/localStorage của trình duyệt. Dữ liệu được tách theo `user.id` + `store.id`, nhưng người có quyền truy cập cùng trình duyệt/DevTools vẫn có thể đọc localStorage. Đăng nhập thật không biến dữ liệu trên máy thành dữ liệu DB an toàn. Danh mục Excel ở chế độ DB là ngoại lệ: được ghi vào PostgreSQL qua RPC. Chưa tự động gán dữ liệu demo cũ cho tài khoản mới; có thể tải backup cũ và khôi phục thủ công sau khi xem trước.

## File và cơ chế

| File | Vai trò |
| --- | --- |
| `src/pages/LoginPage.jsx` | Login, signup, yêu cầu reset; lỗi tiếng Việt không lộ chi tiết Auth/SQL |
| `src/pages/ResetPasswordPage.jsx` | Đặt mật khẩu mới qua `supabase.auth.updateUser` |
| `src/pages/StoreSetupPage.jsx` | Tạo/chọn cửa hàng sau khi xác thực |
| `src/auth/AccountBootstrap.jsx`, `src/services/accountSession.js` | `getSession`, `getUser`, `onAuthStateChange`, chống phản hồi mạng cũ, chặn protected routes trước khi render |
| `src/stores/useAccountStore.js` | Chỉ giữ user/profile/cửa hàng trong bộ nhớ; không persist password/token |
| `src/services/authService.js`, `src/services/storeService.js` | Supabase Auth và truy vấn membership/profile/cửa hàng |
| `src/services/accountService.js` | Tách dữ liệu cục bộ theo UUID user + cửa hàng; xóa dữ liệu bộ nhớ khi logout; backup/restore |
| `src/components/CloudCatalogImport.jsx` | Dùng chung phiên đăng nhập chính, owner-only RPC cho import |
| `backend/supabase/migrations/*.sql` | `profiles` tham chiếu `auth.users`, `stores`/`store_members`, RLS, quyền owner/staff, RPC atomic |
| `backend/supabase/tests/auth_isolation.test.sql` | Hai user/hai shop, thử đọc/sửa chéo và quyền staff bằng SQL với role `authenticated` |

## Login, session, logout

1. App đăng ký `onAuthStateChange`, đọc `getSession()` rồi hỏi Auth server bằng `getUser()`. Nếu chưa có user hợp lệ, route nghiệp vụ chuyển về `/login`; trong lúc kiểm tra chỉ có màn hình chờ.
2. Sau đăng nhập, app đọc membership qua `store_members` và profile qua `profiles`; người chưa có cửa hàng vào `/setup`. Tên/role để hiển thị UI, còn quyền DB do RLS/RPC quyết định.
3. SDK tự refresh session (`autoRefreshToken`). Sự kiện logout, kể cả từ tab khác, xóa user và dữ liệu cục bộ khỏi **bộ nhớ** trước khi route quay về login. `signOut({ scope: 'local' })` thu hồi phiên hiện tại qua Supabase; không dùng `localStorage.clear()` làm logout.
4. Nếu Auth/DB mất mạng hoặc phiên không xác minh được, app không render trang nghiệp vụ; người dùng có thể thử lại.

## Cấu hình cần làm thủ công

- Tạo `.env.local` tại thư mục gốc từ `.env.example`: `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` (hoặc `VITE_SUPABASE_PUBLISHABLE_KEY`). Chỉ key công khai; không đặt service-role/secret vào biến `VITE_*`. `.env.local` được `.gitignore` bỏ qua.
- Trên Supabase Dashboard production, cấu hình Auth Site URL và redirect `/reset-password` đúng domain HTTPS; bật email confirmation nếu muốn bắt buộc xác nhận, cấu hình SMTP gửi email thật; đặt password policy tối thiểu 8 ký tự có chữ và số, kiểm tra rate limits. Cấu hình local trong `backend/supabase/config.toml` đã đặt password policy và redirect local; local email confirmation đang tắt.
- Áp dụng các migration trong `backend/supabase/migrations/` lên DB định dùng. Kiểm tra RLS còn bật và quyền RPC trước khi dùng dữ liệu thật. Production phải dùng HTTPS.
- Supabase local hiện được người dùng chủ động để **tắt**; công việc này không tự bật Docker hoặc DB.

## Cách kiểm tra khi tự mở DB

Trong `D:/little_store_fe`, sau khi bạn chủ động mở Docker và Supabase local:

```powershell
npm run db:start
npm run db:migrate
npm run db:test
npm run dev
```

Mở `/login`, tạo tài khoản A và cửa hàng A; đăng xuất, đăng nhập lại, refresh `/inventory` để kiểm tra session. Mở `/sales` trực tiếp ở cửa sổ chưa đăng nhập phải về `/login`. Quên mật khẩu: gửi email, mở link từ Mailpit local (`http://127.0.0.1:54324`), đặt mật khẩu mới rồi đăng nhập lại. Tạo thêm tài khoản B/cửa hàng B để xem từng cửa hàng riêng; `auth_isolation.test.sql` còn kiểm tra trực tiếp truy vấn theo role `authenticated` rằng B không đọc/sửa được sản phẩm A và staff không đổi tên cửa hàng/nhập danh mục owner-only. Không dùng UI làm bằng chứng duy nhất cho RLS.

Các lệnh frontend:

```powershell
npm run build
npm run lint
npm test
```

## Rủi ro còn lại

- Giao dịch ở localStorage có thể được đọc/sửa bởi người có quyền truy cập cùng trình duyệt, và không đồng bộ giữa thiết bị. Đây là phần backend nghiệp vụ cần nối tiếp bằng repository/RPC đã có, **không nên dùng làm sổ sách production**.
- Dữ liệu demo cũ và backup cũ không được tự chuyển sở hữu; khôi phục backup khác nguồn là thao tác thủ công và có thể thay dữ liệu đang có.
- SQL RLS test mới chưa được chạy khi Supabase local đang tắt; cần chạy `npm run db:test` sau khi bạn chủ động mở lại. Build/lint/unit tests không thay thế phép thử DB.
- Đăng xuất thu hồi phiên refresh hiện tại; access token đã bị sao chép trước đó có thể còn hiệu lực đến khi hết hạn JWT (local đang đặt 3.600 giây). Cần giữ máy/trình duyệt an toàn; thay đổi giới hạn session trong Auth khi đưa lên production.
