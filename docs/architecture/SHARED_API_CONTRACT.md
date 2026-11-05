# Kiến Trúc Kết Nối Dữ Liệu Dùng Chung Cho React Web và Flutter (Shared API Contract)

> **Dự án**: Quản lý bán hàng Tạp hóa BIN (`tap-hoa-bin.pages.dev`)  
> **Phiên bản tài liệu**: 1.0.0 (Phần 1 - Nền tảng kiến trúc đa nền tảng)  
> **Ngày ban hành**: 2026-11-05  
> **Tác giả**: Senior Fullstack / Backend Architect  

---

## 1. Rà Soát Hiện Trạng: Thực Tế Triển Khai vs Mã Nguồn

| Thành phần | Mã nguồn trong repo | Trạng thái triển khai thực tế | Nhận xét kiến trúc |
| :--- | :--- | :--- | :--- |
| **Frontend Web** | `frontend/` (React 19, Vite, Tailwind) | **Đã deploy** tại Cloudflare Pages (`tap-hoa-bin.pages.dev`) | Đang phục vụ trực tiếp người dùng cuối qua Internet. |
| **Auth & Database** | `backend/supabase/migrations/` | **Đã deploy** tại Supabase Cloud (`skakrjcahinmzcwaowxc.supabase.co`) | PostgreSQL 15+, Supabase Auth (Email + Google OAuth PKCE), RLS và các RPC nghiệp vụ. |
| **Edge Function (admin-api)** | `backend/supabase/functions/admin-api/` | **Đã deploy** trên Supabase Edge Runtime | Xử lý các tác vụ quản trị, kiểm soát quyền admin, phân quyền bảo mật cao. |
| **Edge Function (store-api)** | `backend/supabase/functions/store-api/` | **Đã sẵn sàng deploy** trên Supabase Edge Runtime | Endpoint chuẩn hóa đọc danh sách cửa hàng cho cả Web và Flutter. |
| **Node Microservices & Gateway** | `backend/gateway`, `backend/services/*` (7 services Fastify) | **Chưa deploy** lên production (chỉ chạy local/Docker) | Thiết kế microservices hoàn chỉnh nhưng chưa có hạ tầng VPS/Kubernetes public. |
| **Chế độ Demo (Offline)** | `frontend/src/infrastructure/repositories/demoRepository.js` | **Đã hoạt động** trên Web | Dùng `localStorage`, độc lập hoàn toàn với Supabase, không tự động fallback khi cloud lỗi. |

### Sơ Đồ Đường Chạy Thực Tế (Production Hiện Tại)
```
[User Browser]
       │
       ▼
[Cloudflare Pages] (tap-hoa-bin.pages.dev)
       │
       ├─► Supabase Auth (skakrjcahinmzcwaowxc.supabase.co) [Email/Password, Google OAuth]
       ├─► Supabase PostgREST / RPC (Gọi trực tiếp qua Supabase JS SDK với RLS)
       └─► Supabase Edge Function (admin-api)
```

### Sơ Đồ Đường Chạy Mục Tiêu (Web + Flutter App)
```
[React Web (Cloudflare Pages)]        [Flutter App (Android/iOS/Desktop)]
             │                                        │
             ├─────────────┐            ┌─────────────┤
             ▼             ▼            ▼             ▼
      [Supabase Auth]   [Shared Backend API Layer (Store / Core API)]
   (Session & JWT Token)       │  (Bearer Token Auth & Business Logic)
                               ▼
                    [PostgreSQL RPC / RLS]
               (Toán tiền, Trừ kho, Quản lý nợ)
```

---

## 2. So Sánh và Lựa Chọn Kiến Trúc Đích

### Bảng So Sánh Hai Phương Án
| Tiêu chí | Phương Án A: Client gọi trực tiếp Supabase SDK/RPC | Phương Án B: Client qua Shared Backend API (Được chọn) |
| :--- | :--- | :--- |
| **Bảo mật & Kiểm soát** | Dựa 100% vào RLS và Postgres functions. Dễ lộ cấu trúc bảng, khó kiểm soát rate limit tầng app. | Rất cao: API Gateway / Edge Function kiểm tra danh tính độc lập, RLS làm lớp bảo vệ thứ hai (Defense-in-depth). |
| **Xử lý nghiệp vụ tiền/kho/nợ** | Dễ bị cám dỗ tính toán ở Client trước khi ghi xuống DB. | Toàn bộ tính toán tập trung tại Backend/RPC. Client chỉ gửi **Intent** (Ý định thao tác). |
| **Khả năng dùng chung cho Flutter** | Flutter phải import `supabase_flutter` và viết lại toàn bộ query logic, mappers, filters giống React. | Flutter và React dùng chung 100% API contract (JSON HTTP/REST chuẩn). |
| **Chi phí vận hành** | Miễn phí (trong hạn mức Free tier của Supabase). | **Miễn phí**: Triển khai qua Supabase Edge Functions (Deno Runtime) đi kèm sẵn dự án Supabase, không tốn thêm server. |
| **Lượng code cần chuyển đổi** | Thấp ban đầu, nhưng nợ kỹ thuật nhân đôi khi bảo trì đồng thời Web và Flutter. | Vừa phải: Xây dựng dần các endpoint chuẩn hóa theo từng module nghiệp vụ. |
| **Rủi ro ảnh hưởng Web hiện tại** | Thấp, nhưng phân mảnh logic khi nâng cấp. | Rất thấp: Giữ nguyên Web hiện tại, chuyển dần từng adapter sang Shared API Contract. |

> **Quyết Định Kiến Trúc**: **CHỌN PHƯƠNG ÁN B**.  
> **Môi trường Runtime**: Sử dụng **Supabase Edge Functions** làm Backend API chính thức trên Production (tận dụng hạ tầng serverless sẵn có, cùng domain Supabase, không phát sinh chi phí hosting VPS riêng). Đồng thời giữ **Node Fastify Gateway** cho môi trường Local / Docker / Testing.

---

## 3. Quy Ước API Contract Chuẩn

### 3.1. Xác Thực và Phân Quyền (Authentication & Authorization)
- **Token Format**: Client gửi access token lấy từ phiên Supabase Auth trong header:
  ```http
  Authorization: Bearer <supabase_access_token>
  ```
- **Xác minh phía Server**:
  - Backend gọi `supabase.auth.getUser(token)` để giải mã và xác thực chữ ký token.
  - Tuyệt đối **KHÔNG tin tưởng** `userId`, `role`, `storeId`, hoặc bất kỳ claim nào do Client tự khai báo qua query param hoặc request body.
  - Backend đối chiếu `user.id` với bảng `profiles` (`account_status === 'active'`) và bảng `store_members` để đảm bảo tài khoản đang hoạt động và có quyền truy cập cửa hàng tương ứng.

### 3.2. Định Dạng Response Envelope Thống Nhất
Mọi response từ API (dù thành công hay thất bại) đều bọc trong một phong bì chuẩn:

#### Phản hồi Thành công (HTTP 200/201):
```json
{
  "success": true,
  "data": { ... },
  "requestId": "c1000000-0000-4000-8000-000000000001"
}
```

#### Phản hồi Lỗi (HTTP 4xx / 5xx):
```json
{
  "success": false,
  "error": {
    "code": "STORE_FORBIDDEN",
    "message": "Bạn không có quyền thao tác trên cửa hàng này.",
    "details": null
  },
  "requestId": "c1000000-0000-4000-8000-000000000001"
}
```

### 3.3. Bảng Mã Lỗi Ổn Định (Error Codes)
| HTTP Status | Error Code | Ý nghĩa |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Thiếu hoặc sai định dạng `Authorization: Bearer <token>` |
| `401 Unauthorized` | `SESSION_EXPIRED` | Token hết hạn hoặc không hợp lệ |
| `403 Forbidden` | `FORBIDDEN` | Tài khoản bị vô hiệu hóa hoặc không có quyền truy cập |
| `403 Forbidden` | `STORE_FORBIDDEN` | Không thuộc danh sách thành viên cửa hàng (`store_members`) |
| `404 Not Found` | `NOT_FOUND` | Tài nguyên không tồn tại |
| `400 Bad Request` | `VALIDATION_FAILED` | Dữ liệu đầu vào không đúng schema quy định |
| `409 Conflict` | `CONFLICT` | Trùng lặp khóa hoặc xung đột trạng thái dữ liệu |
| `429 Too Many Requests` | `RATE_LIMITED` | Vượt quá tần suất cho phép |
| `500 Internal Error` | `INTERNAL_ERROR` | Lỗi máy chủ (ẩn toàn bộ stack trace và chi tiết nhạy cảm) |
| `503 Unavailable` | `CONNECTION_FAILED` | Không kết nối được cơ sở dữ liệu |

### 3.4. Kiểu Dữ Liệu, Số Lớn (BigInt) và Tiền Tệ
- **Đơn vị tiền tệ**: Việt Nam Đồng (VND), lưu trữ dưới dạng số nguyên (`integer` hoặc `bigint`) trong cơ sở dữ liệu.
- **Không dùng số thực**: Tuyệt đối **không** dùng `float` hay `double` để tính toán tiền tệ nhằm tránh lỗi làm tròn nhị phân (VD: `0.1 + 0.2 = 0.30000000000000004`).
- **Giới hạn số nguyên**: Với các số vượt quá `Number.MAX_SAFE_INTEGER` ($9.007.199.254.740.991$), backend serialize dưới dạng chuỗi số (`string`) để JavaScript và Dart parse an toàn mà không mất mát độ chính xác.

### 3.5. Quy Ước Thời Gian và Múi Giờ
- Lưu trữ cơ sở dữ liệu: `timestamp with time zone` theo chuẩn **UTC**.
- Trả về qua API: Chuỗi ISO 8601 đầy đủ offset múi giờ: `YYYY-MM-DDTHH:mm:ss.sssZ` hoặc `+07:00` (Ví dụ: `2026-11-05T09:30:00+07:00`).
- Múi giờ hiển thị mặc định: `Asia/Ho_Chi_Minh` (GMT+7).

### 3.6. Quy Chuẩn Phân Trang (Pagination)
- Phân trang dạng offset: Tham số `page` (bắt đầu từ 1) và `limit` (mặc định 20, tối đa 100).
- Cấu trúc response có phân trang:
  ```json
  {
    "success": true,
    "data": [ ... ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalRecords": 150,
      "totalPages": 8
    },
    "requestId": "..."
  }
  ```

### 3.7. Nguyên Tắc Idempotency (Chống Trùng Lặp Giao Dịch)
Các API ghi dữ liệu quan trọng (bán hàng, thanh toán nợ, điều chỉnh kho) bắt buộc nhận header `Idempotency-Key` (UUIDv4). Nếu client gửi lại cùng một key do rớt mạng, backend trả về kết quả đã thực hiện trước đó thay vì tạo thêm giao dịch mới.

### 3.8. Nguyên Tắc "Intent-Only" Phía Client
Client (React hay Flutter) chỉ gửi **Ý Định**:
- Bán hàng: Gửi `[{ productId, unitKey, quantity }]`, phương thức thanh toán, số tiền khách đưa. **Không** gửi tổng tiền hóa đơn do client tự tính.
- Backend/PostgreSQL RPC chịu trách nhiệm đọc giá hiện hành trong DB, nhân số lượng, áp dụng khuyến mãi, tính tiền thừa, trừ kho, và cộng công nợ trong một giao dịch cơ sở dữ liệu nguyên tử (`SERIALIZABLE` hoặc khóa dòng `FOR UPDATE`).

---

## 4. Endpoint Mẫu Phần 1: Lấy Danh Sách Cửa Hàng (`GET /api/v1/stores`)

### Thông Tin Kỹ Thuật
- **Method**: `GET`
- **URL**: `/api/v1/stores`
- **Headers**:
  - `Authorization: Bearer <supabase_access_token>` (Bắt buộc)
  - `x-correlation-id: <uuid>` (Tùy chọn)

### Phản Hồi Thành Công (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "11111111-1111-4000-8000-000000000001",
      "name": "Tạp hóa BIN - Cơ sở 1",
      "slug": "tap-hoa-bin-1",
      "role": "owner",
      "storeType": "groceries",
      "currency": "VND",
      "timezone": "Asia/Ho_Chi_Minh",
      "createdAt": "2026-10-01T08:00:00.000Z",
      "updatedAt": "2026-10-01T08:00:00.000Z",
      "permissions": {
        "canSell": true,
        "canManageInventory": true,
        "canViewReports": true,
        "canManageStaff": true
      }
    }
  ],
  "requestId": "c1000000-0000-4000-8000-000000000001"
}
```
*Ghi chú: Nếu người dùng mới đăng nhập chưa có cửa hàng, `data` sẽ là mảng rỗng `[]`. Client dựa vào đây để điều hướng đến màn hình tạo cửa hàng (`/store-setup`).*
