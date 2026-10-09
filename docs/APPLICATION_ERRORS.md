# Lỗi nghiệp vụ và thông báo tiếng Việt

Cập nhật 05/10/2026. Triển khai yêu cầu 161 trong mã nguồn; chưa deploy Edge vào Supabase đang dùng.

## Luồng xử lý

`PostgreSQL / Supabase → Service unwrap → ApplicationError → UI tiếng Việt`.

DB hiện trả SQLSTATE như `42501`, `22023`, `40001`, `P0001`. Service giữ SQLSTATE ở `error.code` và thêm `error.applicationCode` có ý nghĩa với app. Không đổi mã RPC cũ hoặc dữ liệu lịch sử.

| Trường hợp | Mã app | Thông báo |
| --- | --- | --- |
| Thiếu tồn kho | `INSUFFICIENT_STOCK` | Không đủ hàng trong kho. Vui lòng tải lại giỏ hàng. |
| Trả vượt số nợ | `DEBT_OVERPAYMENT` | Số tiền trả vượt quá số nợ hiện tại. |
| Giá/tồn/phiên bản vừa đổi | `DATA_CHANGED` | Dữ liệu đã thay đổi. Vui lòng tải lại và xác nhận thông tin mới. |
| Dùng lại ID cho nội dung khác | `REQUEST_ID_CONFLICT` | Kiểm tra giao dịch trước khi tạo yêu cầu mới. |
| Thiếu quyền | `FORBIDDEN` | Bạn không có quyền thực hiện thao tác này. |
| Lỗi kết nối | `CONNECTION_FAILED` | Kiểm tra mạng và thử lại. |
| Admin cuối cùng | `LAST_ADMIN` | Không thể vô hiệu quản trị viên cuối cùng. |
| Thao tác Admin quá nhanh | `RATE_LIMITED` | Chờ số giây được server trả về, trong giới hạn 1–60 giây. |

Thông báo RPC nghiệp vụ được nhận diện bằng danh sách hằng đã biết hoặc mẫu giới hạn. Tên mặt hàng trong lỗi thiếu kho/đơn vị bị loại bỏ khỏi thông báo công khai. Lỗi SQL không nhận diện được dùng thông báo chung; không hiển thị `message`, `details`, `hint`, bảng, SQL hay stack do provider trả về.

## File đảm nhiệm

- `backend/supabase/functions/_shared/applicationErrors.js`: hợp đồng lỗi dùng chung, mã/thông báo, map SQLSTATE, mã HTTP và đọc payload Admin an toàn. Module thuần JavaScript, không import SDK, React, Zustand hoặc biến môi trường.
- `src/services/serviceUtils.js`: lọc cả SDK error result và Promise bị reject tại `unwrap`.
- `src/services/legacyImportService.js`: dùng cùng ranh giới lỗi cho truy vấn đếm khi đối chiếu. Nếu import đã commit nhưng đối chiếu lỗi, vẫn giữ `importCommitted`, `batchId` và thông báo yêu cầu kiểm tra DB.
- `backend/supabase/functions/admin-api/validation.js`: lỗi kiểm tra input là instance nội bộ `AdminValidationError`; không nhận diện bằng từ khóa trong thông báo provider.
- `backend/supabase/functions/admin-api/index.js`: chỉ trả JSON công khai `{ code, error }`; HTTP 429 thêm `retryAfter` và header `Retry-After`.
- `src/admin/services/adminApi.js`: đọc mã công khai rồi chọn thông báo định nghĩa sẵn tại client. Không tin trường `error` từ HTTP body, kể cả lỗi proxy/HTML hoặc backend cũ.
- `src/services/authMessages.js`: thông báo tài khoản tiếp tục dùng bộ lọc riêng, tránh tiết lộ thông tin Auth. `getUser` vẫn phân biệt phiên không tồn tại và lỗi xác thực; UI tài khoản không hiển thị provider message.

Chi tiết gốc chỉ giữ ở `cause` cho xử lý nội bộ, không tự động log hoặc gửi telemetry. UI dùng `error.message`, không render `cause`. Khi bổ sung RPC mới, thêm mã tương ứng vào hợp đồng và kiểm tra; không dùng quy tắc cho phép mọi thông báo tiếng Việt.

## Retry và dữ liệu đã commit

Thay đổi lớp lỗi không hoàn tác transaction đã commit và không chuyển sang demo. `cloudCommandRunner` giữ journal/request ID khi ghi hoặc reload lỗi; thử lại cùng ý định dùng cùng ID. Journal chỉ được hoàn tất sau khi reload thành công và phiên/cửa hàng vẫn đúng.

## Kiểm tra

`tests/application-errors.test.js` có 11 kiểm tra: SQL/provider diagnostics, lỗi nghiệp vụ có tên động, malformed JSON, giả mạo loại validation, HTTP semantics, payload Admin không tin cậy, giới hạn thời gian chờ, SDK result/rejection và retry sau commit.

```powershell
Set-Location D:\little_store_fe
node --test tests/application-errors.test.js
npm test
npm run lint
npm run build
```

Đây là kiểm tra module/service với client giả lập. Kiểm tra Auth/PostgREST/Edge HTTP thực tế cần chạy khi người dùng chủ động mở Supabase. Không có migration DB mới trong thay đổi này.
