# Rà soát và gia cố bảo mật — 31/10/2026

Phạm vi: mã nguồn `frontend/`, Node microservices trong `backend/`, migration PostgreSQL và cấu hình Cloudflare Pages. Web đang chạy trực tiếp với Supabase Cloud; Node gateway/microservices hiện chưa được deploy. Không coi kiểm tra mã nguồn là bằng chứng cấu hình DB Cloud đã áp migration mới.

| Điểm cần xử lý | Nguồn | Kết quả trong code |
| --- | --- | --- |
| Rate limit đăng nhập/đăng ký bị gộp theo IP gateway | Danh sách người dùng | Gateway giới hạn từng IP; gateway ký IP chuyển tiếp, các service xác minh trước khi dùng làm khóa rate limit. Reverse proxy phải khai báo đúng `TRUSTED_PROXY_CIDRS`. |
| CSV formula injection sau khoảng trắng/ký tự điều khiển | Danh sách người dùng | Xuất CSV thêm dấu nháy đơn vào đầu ô có nguy cơ, giữ quote và escape dấu nháy kép. Không có một cách escape CSV nào bảo đảm cho mọi phần mềm bảng tính sau khi lưu lại file. |
| Đăng ký và đổi mật khẩu kiểm tra khác nhau | Danh sách người dùng | Cả hai dùng chính sách chung: tối thiểu 8 ký tự, có chữ và số, tối đa 72 byte UTF-8 theo giới hạn Supabase Auth. Node register cũng kiểm tra phía server. UI đăng ký trước đó đã kiểm tra tối thiểu 8 ký tự; nhận định 6 ký tự không đúng với phiên bản hiện tại. |
| Thư mục Supabase tạm ở gốc chưa được ignore | Danh sách người dùng | Đã thêm `supabase/.temp/` và `supabase/.branches/` vào `.gitignore` gốc. |
| CSP và Referrer Policy | Trùng giữa hai lần rà soát | Thêm CSP, Referrer Policy và các header bảo vệ trong `frontend/public/_headers` cho Cloudflare Pages; thêm referrer meta. Web live đã có Referrer Policy từ Cloudflare, nhưng trước đó không có CSP. |
| RPC cũ cho phép bỏ qua luồng xem lại/idempotency mới | Rà soát trước | Frontend luôn gọi RPC đã xem lại cho bán hàng và idempotent cho sản phẩm; migration mới thu hồi `EXECUTE` trực tiếp trên `create_sale`, `cancel_sale`, `save_product`, `record_inventory_count` cho `anon` và `authenticated`. Wrapper nội bộ vẫn gọi được. |
| Dependency Node backend có cảnh báo `npm audit` | Rà soát trước | Cập nhật lockfile và override `glob` bản đã vá; `npm audit` hiện báo 0 cảnh báo. Node backend chưa deploy. |

Điều chỉnh kết luận trước: nhận định `auth.admin.signOut` trong Node backend chắc chắn cần service-role key là không đúng với phương thức cụ thể này. SDK gửi JWT của người dùng tới endpoint logout; chưa có bằng chứng đây là lỗi, nên không sửa luồng đăng xuất. Frontend dùng `auth.signOut({ scope: 'local' })`.

Xác minh: 146 frontend tests, 14 Node tests, lint và build đạt; 40 migration áp vào PostgreSQL cô lập, kiểm tra race/idempotency và quyền RPC đạt; `npm audit --omit=dev` ở frontend và backend báo 0. Docker local không được tự khởi động. pgTAP/Supabase integration chưa chạy. Migration `202610310001` đã áp lên Supabase Cloud; `frontend/dist/_headers` đã có trong bản build.

Giới hạn còn lại: web hiện dùng Supabase trực tiếp và lưu phiên theo cơ chế browser của Supabase JS. CSP giảm nguy cơ khi có lỗi chèn script nhưng không thay thế việc rà soát XSS hoặc chuyển sang phiên HttpOnly qua backend. Rate limit Node dùng bộ nhớ từng tiến trình; khi chạy nhiều replica cần Redis/shared store. Không khai báo `TRUSTED_PROXY_CIDRS` rộng hơn proxy thực tế.
