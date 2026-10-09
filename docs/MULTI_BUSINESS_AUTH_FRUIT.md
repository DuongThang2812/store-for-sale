# Một ứng dụng cho tạp hóa và cửa hàng trái cây

## Trạng thái triển khai

Ứng dụng dùng một codebase React/Vite/JavaScript. Supabase Auth là nguồn xác thực; `stores` và `store_members` giữ loại cửa hàng và vai trò riêng biệt. Migration `backend/supabase/migrations/202610040001_multi_business_fruit.sql` mở rộng PostgreSQL cho trái cây, danh mục, nhà cung cấp, lô hàng và điều chỉnh tồn. Ngày 05/10/2026, migration đã áp dụng vào Supabase local và `npm run db:test` đạt **101/101 test SQL** trên 4 file. Chưa triển khai migration này lên Supabase production; Docker/Supabase không được cấu hình tự bật.

Màn Bán hàng, Kho, Sổ nợ, Doanh thu, Lịch sử và Sao lưu hiện vẫn dùng Zustand/localStorage theo tài khoản và cửa hàng. Chúng là luồng trên máy, **chưa ghi giao dịch vào DB**; RLS không bảo vệ các bản ghi trong trình duyệt. Trang nhập danh mục Excel, danh mục hàng và nhà cung cấp là các phần có truy vấn Supabase DB. Không tự chuyển dữ liệu cũ trong localStorage lên cloud vì không thể xác minh chủ sở hữu và số dư từ dữ liệu trên máy.

## Luồng tài khoản

1. `/login` đăng nhập bằng `signInWithPassword`; đăng ký bằng `signUp` với tên, email, mật khẩu; quên mật khẩu dùng `resetPasswordForEmail`. Mật khẩu mới được gửi qua `updateUser`. Form chặn gửi lặp, kiểm tra cơ bản và dùng thông báo tiếng Việt không tiết lộ email có tồn tại hay không.
2. Khi tải ứng dụng, `AccountBootstrap` gọi `getSession` rồi `getUser`, đọc membership/cửa hàng qua DB và nghe `onAuthStateChange`. Trong lúc chờ, route nghiệp vụ chỉ hiện màn đang kiểm tra. Phiên tự làm mới bởi Supabase SDK.
3. Người chưa đăng nhập tới `/login`; người có tài khoản nhưng chưa chọn cửa hàng tới `/setup`. Chủ tiệm chọn **Tạp hóa** hoặc **Trái cây** khi tạo cửa hàng; RPC tạo luôn membership `owner` bằng `auth.uid()`. Tài khoản có thể chọn hoặc thêm cửa hàng khác.
4. Đăng xuất gọi Supabase `signOut`, xóa state nghiệp vụ trong bộ nhớ và quay về `/login`. Dữ liệu đã lưu trên máy vẫn được giữ để có thể xuất/khôi phục; không coi một cờ localStorage là bằng chứng đăng nhập.
5. Trường `role` (`owner`, `staff`) là quyền của thành viên; `business_type` (`grocery`, `fruit_shop`) là loại cửa hàng. Trang tài khoản hiển thị cả hai mà không hiển thị token.

## Dữ liệu và quyền trên DB

- Dùng `stores`/`store_members` hiện có thay vì tạo hai cặp bảng `shops` mới làm đứt khóa ngoại cũ. Migration thêm `stores.business_type` với mặc định `grocery` cho dữ liệu cũ.
- `categories` thuộc một cửa hàng; chủ tiệm tạo qua RPC `save_category`. `suppliers` thuộc một cửa hàng; chủ tiệm lưu qua RPC `save_supplier`. `product_batches` chuẩn bị lưu số lượng, giá nhập tại thời điểm nhận hàng, nhà cung cấp và hạn sử dụng. Mỗi dòng nhập/bán hiện cũng giữ snapshot giá riêng.
- Bảng nghiệp vụ bật RLS, `SELECT` dựa trên membership theo `auth.uid()`. Các bảng tiền, hàng, nợ và bảng mới không cho ứng dụng ghi trực tiếp bằng Data API; thay đổi đi qua RPC xác thực cửa hàng và quyền. Chủ tiệm quản lý danh mục, nhà cung cấp, mặt hàng, hủy đơn và điều chỉnh tồn; nhân viên có thể bán, nhập kho, ghi nợ và thu nợ qua RPC. Quyền ở giao diện chỉ để hướng dẫn, DB mới là ranh giới bảo mật.
- RPC bán hàng, nhập kho, trả nợ và điều chỉnh tồn nhận `p_request_id` để chống ghi trùng. Cùng mã yêu cầu nhưng payload khác phải bị từ chối. Tiền lưu `bigint` VNĐ; tồn theo đơn vị cơ sở nguyên. Với hàng cân ký, đơn vị cơ sở là **gram**, một kg = 1.000 gram. Số lượng bán lưu `numeric(14,3)` kg; server làm tròn tổng tiền từng dòng thành VNĐ. Ví dụ 1,35 kg × 180.000đ/kg = 243.000đ. Hàng hư 1,2 kg tạo movement `spoiled` −1.200 gram, không sửa tồn trực tiếp.
- Hiện màn trái cây nhập/bán cân ký bằng tay; không có kết nối cân điện tử. Các đơn vị đếm như quả/hộp/khay/túi cần quy cách thực tế của từng mặt hàng trước khi cấu hình quy đổi, nên không tự đoán khối lượng.

## Kiểm tra bảo mật và vận hành

```powershell
Set-Location D:/little_store_fe
npm run build
npm run lint
npm test

# Chỉ chạy khi bạn chủ động mở lại Supabase local:
npm run db:start
npm run db:migrate
npm run db:test
```

Các test JavaScript xác nhận Auth/service/mapper và luồng cục bộ. Test SQL trong `backend/supabase/tests/` dùng hai user/cửa hàng, thử đọc/ghi chéo cửa hàng, thao tác owner-only bằng staff, số lượng trái cây thập phân, mất hàng và snapshot giá. `npm run db:test` cần PostgreSQL đang chạy; `npm test` không thay thế kiểm tra RLS thật. Không chạy `db:reset` nếu cần giữ dữ liệu local.

Tại Supabase Auth, cần cấu hình URL của ứng dụng và URL chuyển hướng `/login`, `/reset-password` trong [URL Configuration](https://supabase.com/docs/guides/auth/redirect-urls), kiểm tra tùy chọn xác nhận email và chính sách mật khẩu phía server. [Supabase Auth có giới hạn tần suất](https://supabase.com/docs/guides/auth/rate-limits) cho các endpoint đăng nhập/đăng ký/khôi phục; kiểm tra cấu hình thực tế trước production. Production dùng HTTPS. `.env.local` chỉ chứa `VITE_SUPABASE_URL` và **publishable/anon key**, không chứa service-role key. `.env`, `.env.*` được bỏ qua bởi Git, trừ `.env.example` chỉ có placeholder.

## Còn cần làm trước khi dùng nhiều thiết bị

Luồng bán/kho/nợ/doanh thu hiện cục bộ, nên chưa có đồng bộ hoặc RLS cho giao dịch mà người dùng thao tác trên các màn chính. Bước tiếp theo là nối các trang đó với `supabaseShopRepository`, dùng cùng `requestId` khi retry, đọc lại số dư/tồn từ server, đối soát dữ liệu cũ với chủ tiệm trước khi nhập. Cần kiểm thử trực tiếp PostgreSQL khi bạn mở lại Supabase, rồi thử toàn bộ thao tác giao diện trên trình duyệt. Quản lý nhân viên, phân bổ FIFO theo lô, nhiều quy cách quả/hộp/khay và cân điện tử có thể thêm sau khi dữ liệu giao dịch đã chạy ổn định.

## Bàn giao theo 22 mục

| # | Nội dung | Trạng thái / vị trí |
| --- | --- | --- |
| 1 | File tạo | `src/domain/businessTypes.js`, `src/services/categoryService.js`, `src/services/supplierService.js`, `src/pages/CategoriesPage.jsx`, `src/pages/SuppliersPage.jsx`, migration/test SQL mới và tài liệu này. |
| 2 | File sửa | Onboarding, route, sidebar, tài khoản, mapper/service/repository, màn bán/kho, tính giá, Zustand, test, `.gitignore`, README. |
| 3 | Login | `LoginPage` → `authService.signIn` → `supabase.auth.signInWithPassword`. |
| 4 | Logout | `authService.signOut` → `accountSession.signedOut` xóa state trong bộ nhớ; quay `/login`. |
| 5 | Signup | `signUp`, xác nhận email nếu không có session; không tự tạo mật khẩu trong DB. |
| 6 | Quên mật khẩu | `resetPasswordForEmail` → `/reset-password` → `updateUser`. |
| 7 | Session | `getSession` + `getUser` + `onAuthStateChange`; route guard chờ kiểm tra xong. |
| 8 | Cửa hàng | Bảng `stores` thêm `business_type`, các cửa hàng cũ mặc định `grocery`. |
| 9 | Thành viên | Bảng `store_members` giữ `store_id`, `user_id`, `role`; RPC tạo cửa hàng gán chủ tiệm server-side. |
| 10 | RBAC | Chủ tiệm quản lý danh mục/hàng/nhà cung cấp, hủy đơn, điều chỉnh kho; nhân viên bán/nhập/ghi nợ/thu nợ. DB RPC kiểm tra quyền. |
| 11 | Hai mô hình | `grocery` giữ luồng cũ; `fruit_shop` có form/cân ký/đơn vị và nhãn phù hợp, chung Auth/DB. |
| 12 | Bảng mới | `categories`, `suppliers`, `product_batches`; các bảng giao dịch cũ được mở rộng. |
| 13 | RLS | Bảng mới có member `SELECT` policy và không có grant ghi trực tiếp; bảng cũ tiếp tục RLS. |
| 14 | Bảo mật | `src/lib/supabase.js`, auth guard, membership query, RPC `security definer` có xác minh cửa hàng, `p_request_id`/hash. |
| 15 | Test chéo cửa hàng | `backend/supabase/tests/multi_business_fruit.test.sql` kiểm tra cửa hàng A không đọc/sửa dữ liệu cửa hàng B; đã chạy trên DB local. |
| 16 | Test quyền | Cùng file kiểm tra staff không gọi thao tác owner-only và Data API không ghi bảng lô; đã chạy trên DB local. |
| 17 | Env | `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `.env.example` chỉ là mẫu. |
| 18 | Dashboard | Cấu hình URL/redirect, email confirmation, password policy và kiểm tra Auth rate limits; production HTTPS. |
| 19 | Dữ liệu cũ | Giữ nguyên localStorage/backup, không tự nhận dữ liệu này là dữ liệu DB; cần đối soát với chủ tiệm. |
| 20 | Rủi ro còn lại | Giao dịch trên màn chính chưa đồng bộ/RLS; dữ liệu local có thể sửa trên máy. Migration mới chỉ được kiểm tra trên DB local. |
| 21 | Fruit đã có | Nhập/bán kg lẻ đến 1 gram, tồn gram nguyên, snapshot giá, lý do hao hụt/lịch sử, DB decimal/RPC. |
| 22 | Fruit giai đoạn sau | Quy cách quả/hộp/khay/túi/thùng theo từng SKU, cân điện tử, batch FIFO và màn giao dịch DB đầy đủ. |
