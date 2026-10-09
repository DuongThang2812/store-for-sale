# Kiểm tra database không tự khởi động Docker

Mã nguồn có ba lớp kiểm tra. Không dùng kết quả SQL để tuyên bố Auth/PostgREST/Edge đã được nghiệm thu.

| Lệnh | Kiểm tra |
| --- | --- |
| `npm test` | Service/mapper/repository, demo, retry và bảo vệ response khác phiên. |
| `npm run db:test:isolated` | Áp mọi migration vào PostgreSQL tạm; assertion nghiệp vụ/RLS và các giao dịch cạnh tranh. |
| `npm run db:test` | pgTAP trên Supabase local đã được người dùng chủ động mở. |
| `npm run test:integration` | Auth/PostgREST thật qua service/repository; Admin Edge/TOTP/ban/unban/retry/HTTP 429. Chỉ stack local. |

## PostgreSQL tạm

```powershell
Set-Location D:\little_store_fe
npm run db:test:isolated
```

Cần PostgreSQL cài sẵn. Mặc định dùng `C:/Program Files/PostgreSQL/18/bin`, port `55438`; có thể đổi bằng `PG_BIN`/`PG_VALIDATION_PORT`. Script không kết nối service/DB cửa hàng, không bật Docker. Cluster chỉ lắng nghe localhost, dừng sau kiểm tra, xóa data của lần chạy và giữ log trong thư mục `taphoa-sql-validation-*` do chính script tạo.

Fixture mô phỏng `auth.users` và `auth.uid()` để kiểm tra PostgreSQL/RLS; không mô phỏng HTTP hoặc gửi email. `backend/tests/*_isolated.sql` có assertion nghiệp vụ bổ sung. `scripts/validate-postgres-concurrency.mjs` sử dụng các kết nối psql riêng cho retry trùng, bán tranh tồn, trả nợ tranh số dư, thu hồi quyền staff đang có giao dịch và Admin tranh slot rate limit cuối.

## Chạy cả bộ pgTAP trên cluster tạm

Nếu máy chưa cài extension pgTAP, có thể nạp bản SQL chính thức vào **cluster tạm**. Nguồn: [theory/pgtap 1.3.4, commit cố định](https://github.com/theory/pgtap/tree/968eb53a33114e83042b3bdb0c664b5b80cf8bdf). Không cần ghi vào thư mục PostgreSQL của máy.

```powershell
Set-Location D:\little_store_fe
$tapSource = Join-Path $env:TEMP 'taphoa-pgtap-1.3.4.sql.in'
$tapSql = Join-Path $env:TEMP 'taphoa-pgtap-1.3.4.sql'
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/theory/pgtap/968eb53a33114e83042b3bdb0c664b5b80cf8bdf/sql/pgtap.sql.in' -OutFile $tapSource
[System.IO.File]::WriteAllText($tapSql, ([System.IO.File]::ReadAllText($tapSource).Replace('__OS__', 'MSWin32').Replace('__VERSION__', '1.3')))
$env:PGTAP_SQL = $tapSql
npm run db:test:isolated
Remove-Item Env:\PGTAP_SQL
```

Hai giá trị thay thế theo Makefile pgTAP: tên hệ điều hành và phiên bản số major.minor. Script nạp các hàm gốc, seed mẫu vào DB tạm rồi chạy toàn bộ `backend/supabase/tests/*.test.sql`; chỉ bỏ dòng `CREATE EXTENSION` vì các hàm đã được nạp. Các assertion, transaction và rollback được giữ nguyên. Có `not ok`, thiếu assertion, lệch plan hoặc lỗi SQL thì lệnh thất bại.

Lần chạy 05/10/2026: **32 migration, 487 pgTAP assertions đạt**, cộng assertion riêng và kiểm tra concurrency. Không có migration mới nào được áp vào Supabase đang dùng trong lần kiểm tra này.

## Kiểm tra Supabase thật sau khi mở Docker

```powershell
npm run db:start
npm run db:migrate
npm run db:test
npm run backend:check
npm run test:integration
```

Lần nghiệm thu local mới: **33 migration, 504/504 pgTAP, 43 kiểm tra Shop HTTP và Admin Edge/MFA/ban/unban/retry/429 đạt**. Đã sao lưu trước migration, giữ nguyên dữ liệu hiện có; xem [biên bản local](LOCAL_SUPABASE_ACCEPTANCE.md). Không dùng `db:reset`. Browser mất mạng sau commit, email và production còn chờ. Các lệnh kiểm tra không tự khởi động Docker.
