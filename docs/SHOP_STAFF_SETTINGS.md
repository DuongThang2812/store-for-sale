# Cài đặt cửa hàng và phân quyền nhân viên

Cập nhật 05/10/2026. Đã có mã nguồn và kiểm tra PostgreSQL; migration mới chưa được áp vào Supabase đang dùng vì Docker vẫn tắt.

## Cách sử dụng

1. Nhân viên đăng ký tài khoản bằng email của mình tại màn hình đăng nhập/đăng ký.
2. Chủ tiệm mở **Cài đặt → Nhân viên → Thêm nhân viên**, nhập đúng email đã đăng ký.
3. Chọn quyền rồi xác nhận. Mặc định nhân viên mới chỉ bán hàng trả ngay.
4. Khi cần, sửa quyền hoặc bỏ chọn **Còn làm việc tại tiệm**. Lịch sử giao dịch được giữ; không xóa tài khoản Auth.
5. Nhân viên tải lại trang để giao diện nhận quyền mới. DB kiểm tra quyền hiện tại trong từng RPC và từng truy vấn, kể cả với JWT/tab cũ.

Chủ tiệm sửa tên, số điện thoại, địa chỉ trong **Thông tin tiệm**. Nếu thông tin đã được sửa ở thiết bị khác, đóng xác nhận, chọn **Tải lại từ DB**, xem thông tin mới rồi sửa lại. Không tự ghi đè thay đổi của người khác.

Ứng dụng không tự gửi thư mời, tạo mật khẩu hoặc đổi quyền chủ tiệm qua màn hình nhân viên. Email cần thuộc tài khoản đã tồn tại và đang hoạt động.

## Quyền

| Nghiệp vụ | Chủ tiệm | Nhân viên |
| --- | --- | --- |
| Xem danh mục/kho/giá bán | Có | Có, nếu thành viên còn hoạt động |
| Bán trả ngay | Có | `can_sell` |
| Bán mua chịu | Có | Cả `can_sell` và `can_manage_debt` |
| Xem/quản lý khách, công nợ, nhận trả nợ | Có | `can_manage_debt` |
| Nhập thêm hàng đã có | Có | `can_receive_stock` |
| Tạo/sửa hàng, nhập CSV/Excel | Có | Không |
| Hủy đơn, kiểm kê, điều chỉnh, định giá tồn đầu kỳ | Có | Không |
| Giá vốn/lãi/báo cáo quản trị | Có | Không |
| Cài đặt và quản lý nhân viên | Có | Không |

Nhân viên có quyền công nợ vẫn nhận trả nợ được khi quyền bán tắt. Quyền nhập bao gồm cập nhật giá nhập tham chiếu của đơn vị trong phiếu nhập; không cấp quyền sửa quy cách/giá bán.

Migration giữ quyền bán/nhập/nợ mà các thành viên **đã tồn tại trước migration** đang có. Chủ tiệm cần rà lại danh sách nếu muốn thu hẹp quyền. Thành viên thêm mới mặc định chỉ bán trả ngay.

## Luồng và file

`ShopSettingsPage → shopSettingsService → save_store_settings / save_store_staff → PostgreSQL transaction + audit + request ID`.

| File | Nhiệm vụ |
| --- | --- |
| `src/pages/ShopSettingsPage.jsx` | Form thông tin, danh sách phân trang, thêm/sửa quyền và xác nhận. |
| `src/services/shopSettingsService.js` | Kiểm tra input, giữ request ID, gọi một RPC mỗi thay đổi. |
| `src/domain/shopPermissions.js` | Quyền thao tác cho menu và trang. |
| `src/auth/ShopOperationGate.jsx` | Chặn truy cập route không được cấp quyền. |
| `src/mappers/storeMapper.js`, `src/services/storeService.js` | Nạp membership, quyền và phiên bản từ DB. |
| `src/services/cloudCommandRunner.js`, `requestJournal.js` | Retry giữ ID; bỏ response sau đổi tài khoản/cửa hàng. |
| `backend/supabase/migrations/202610050020_shop_staff_settings.sql` | Cột quyền/cài đặt, RLS, trigger, RPC roster và cấu hình. |
| `backend/supabase/migrations/202610050021_activity_staff_permissions.sql` | Lịch sử server không lộ công nợ cho người thiếu quyền. |
| `backend/supabase/migrations/202610050022_rpc_permission_admission.sql` | Kiểm tra quyền trước đọc request cũ hoặc ghi nghiệp vụ, kể cả RPC tương thích. |

Không dùng giới hạn menu làm lớp bảo mật. RLS ẩn khách/đơn mua chịu/lịch sử nợ nếu thiếu quyền. Browser không được ghi trực tiếp bảng quyền hoặc cấu hình; các thay đổi đi qua RPC và audit trong cùng transaction.

`permission_version` và `settings_version` ngăn lưu dữ liệu cũ. `p_request_id` cùng payload trả lại kết quả đã commit; tái dùng ID cho thay đổi khác bị từ chối.

Admission giữ khóa chia sẻ cửa hàng → membership → profile đến khi transaction kết thúc. Thu hồi quyền phải chờ đơn đã được nhận xử lý hoàn tất; sau khi thu hồi commit, tab cũ không bắt đầu đơn mới được. Lịch sử đơn đã hoàn tất vẫn giữ nguyên.

## Kiểm tra và áp migration

Đã kiểm tra nhân viên mặc định, cấp/thu hồi quyền, thu tiền không cần quyền bán, version cũ, chống ghi trùng, không xóa owner, tenant isolation, không ghi bảng trực tiếp và thu hồi quyền đồng thời với bán hàng.

```powershell
Set-Location D:\little_store_fe
npm test
npm run lint
npm run build
npm run db:test:isolated
```

`db:test:isolated` cần PostgreSQL cài sẵn, chạy trên cluster tạm và dừng sau kiểm tra. Không xác nhận Auth/PostgREST/Edge vì `auth.uid()` được mô phỏng.

Khi bạn chủ động mở Docker:

```powershell
npm run db:start
npm run db:migrate
npm run db:test
npm run dev
```

Không reset DB để áp những migration này. Khi dùng trên Supabase thật, kiểm tra bằng hai tài khoản riêng: owner và staff, bao gồm tab staff đang mở khi owner thu hồi quyền.
