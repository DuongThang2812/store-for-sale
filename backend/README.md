# Backend Tạp hóa BIN

Backend nằm trong cùng Git repo tại `D:/little_store_fe/backend`, dùng **Supabase Auth + PostgreSQL/RPC**. Cập nhật: 05/10/2026. Xem [trạng thái hiện tại](../docs/CLOUD_IMPLEMENTATION_STATUS.md) để phân biệt mã đã có với phần còn cần kiểm chứng trên Supabase thật.

```text
little_store_fe/backend/
├── package.json                  # Supabase CLI và lệnh chạy backend
├── package-lock.json
├── docs/DATABASE_DESIGN.md
└── supabase/
    ├── config.toml
    ├── migrations/              # 33 migration: schema, RLS, RPC và Admin
    ├── functions/admin-api/     # JWT/AAL2 và Admin service-role ở server
    ├── seed.sql
    └── tests/                   # pgTAP nghiệp vụ, bảo mật và Admin
```

## Chạy backend

Mở Docker Desktop, chờ Engine chạy, rồi mở PowerShell:

```powershell
Set-Location D:/little_store_fe/backend
npm ci
npm run db:start
npm run db:migrate
npm run db:test
```

Các lệnh khác:

- `npm run db:status`: xem trạng thái và thông tin kết nối local; không chia sẻ secret key trong output.
- `npm run db:stop`: dừng Supabase local.
- `npm run db:reset`: xóa và dựng lại DB local từ migration/seed; chỉ chạy khi chấp nhận bỏ dữ liệu local. Không cần chạy sau khi gộp thư mục.

Các lệnh `db:*` cũng chạy được từ thư mục gốc `D:/little_store_fe`; script ở gốc chuyển lệnh tới package backend này.

`project_id = "little_store_fe"` được giữ nguyên trong `config.toml` để CLI dùng cùng định danh container/volume local trước khi di chuyển. Đây là định danh môi trường cũ, không phải đường dẫn chứa mã nguồn. Không đổi tên chỉ để khớp tên thư mục.

## Kết nối frontend

Frontend chạy từ `D:/little_store_fe` bằng `npm run dev`. Điền API URL và publishable/anon key vào `.env.local` ở thư mục gốc; URL local vẫn là `http://127.0.0.1:54321`.

Các file `src/lib/supabase.js`, `src/services`, `src/repositories`, `src/mappers` ở thư mục gốc là mã chạy trong trình duyệt để gọi backend. SQL/RPC, cấu hình server và Supabase CLI có một bản chính trong `backend/`.

Các nghiệp vụ cloud đã nối RPC atomic qua Service/Repository/Mapper; demo/legacy trên máy được giữ riêng. Không persist số dư cloud vào localStorage. Supabase local do người dùng mở đã áp 33 migration; 504 kiểm tra DB và Auth/PostgREST/Edge/MFA integration đạt. [Biên bản local](../docs/LOCAL_SUPABASE_ACCEPTANCE.md). Không dùng `db:reset` để cập nhật dữ liệu hiện có.

- [Thiết kế database](docs/DATABASE_DESIGN.md)
- [Hướng dẫn lớp kết nối giai đoạn 0–1](../docs/BACKEND_PHASE_0_1.md)
- [Kiểm tra DB không tự khởi động Docker](../docs/DATABASE_TESTING.md)
- [Cài đặt và nhân viên](../docs/SHOP_STAFF_SETTINGS.md)
- [Admin filter/sort/phân trang](../docs/ADMIN_LIST_FILTERS.md)
