# BIN — audit trước chuyển kiến trúc, 08/10/2026

Nguồn yêu cầu: attachment `c8f71c96-edab-4400-a36b-c341211db023/Pasted text.txt`, 154 mục. Các route/port/tên thư mục trong tài liệu là ví dụ; yêu cầu bắt buộc là UI-only, API Gateway, server authorization/validation/calculations, dữ liệu chỉ backend truy cập, service chạy độc lập và OpenAPI. Không đổi sang Java/TypeScript khi repo đang dùng JavaScript.

## A. Logic hiện ở frontend

`useShopStore.js` chứa demo checkout, trừ tồn, trả nợ, hoàn kho, lưu sản phẩm và persist local. `saleCancellation.js` tính phân bổ nợ/hoàn tiền; `revenue.js` aggregate doanh thu; `productPricing.js` chứa quy đổi/cart total/giới hạn tồn. `useCloudShopStore.js` gọi command server nhưng vẫn chuyển quantity/giới hạn cart và có thể chọn legacy demo. `stockCsv.js`, `catalogWorkbook.js`, `legacyMigration.js` kiểm tra/chuyển dữ liệu nhập. `productMapper.js` xây payload quy cách/giá; `shopPermissions.js` và gates dùng cho UX. Máy tính cộng/trừ nhân/chia là công cụ UI riêng, không quyết định tiền của giao dịch.

## B. Logic hiện ở backend

33 migration PostgreSQL: Auth profile trigger, member/shop lifecycle, atomic checkout/import/payment/cancellation/count, COGS/WAC snapshots, report/dashboard, staff permissions, Admin audit/admission/lease. `admin-api` Edge xác minh JWT/AAL2 và gọi RPC. Đây là backend có thật, nhưng chưa có REST application server thuộc từng domain trong repo. Đăng nhập hiện do Supabase Auth cung cấp, không có login controller tự viết.

## C. Logic trùng

Demo business rules và PostgreSQL có cùng checkout/debt/cancellation nhưng khác storage, schema và khả năng transaction. UI preview chuyển đơn vị/giá có thể khác rule DB. Frontend validation không thay thế DB validation. Đích cuối bỏ authoritative demo/local mutations; dữ liệu legacy chỉ backup/import có kiểm tra.

## D–E. Direct DB và Supabase calls

`src/lib/supabase.js` khởi tạo SDK trong browser. Auth service gọi Auth; product/category/customer/supplier/store services query bảng/view; sales/inventory/report/activity/settings/legacy gọi RPC; Admin service gọi Edge và MFA pages gọi Auth SDK trực tiếp. `supabaseShopRepository.js` cùng mappers là adapters browser. Chưa có API Gateway. Frontend có public key; không phát hiện service-role được cấu hình cho frontend trong lần triển khai trước.

## F. Rủi ro

UI state/demo có thể quyết định số dư; browser truy cập Data API/RPC; cached permission chỉ dùng được cho hiển thị. Chuyển Auth sang cookie trước khi business clients sẵn sàng sẽ làm các truy vấn JWT hiện tại hỏng. Tách checkout thành ba HTTP writes sẽ phá atomicity. Đổi schema vật lý/drop bảng sẽ rủi ro FK/triggers/dữ liệu. Vì vậy không big-bang cutover và không dùng service-role thay RLS cho toàn bộ business reads.

## G–H. Rules/files phải chuyển

Các nguồn ở A và D–E, repositories/mappers, account session/bootstrap, Login/Reset/MFA, các trang Sales/Stock/Debt/Revenue/Home/CSV/Legacy/Settings/Admin, storage/backup, Vite config và env. Giữ form/input/formatting/routes/styles. Presentation preview được phép theo mục 24/57/63 nhưng final pricing/conversion/stock/debt/report và mọi mutation phải server quyết định. Server luôn đọc session/membership, không tin role/userId do client gửi.

## I. Service boundaries và lựa chọn stack

Node.js ESM + Fastify 5 + JSON Schema + Swagger/OpenAPI + PostgreSQL `pg`; giữ Supabase làm identity provider. Framework validation và response serialization theo [Fastify](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/); Swagger theo [plugin chính thức](https://github.com/fastify/fastify-swagger). Gateway mỏng, proxy REST; shared chỉ security/error/logging/schema primitives/database connection infrastructure, không chứa domain entity/repository.

| Service | Port | Owner | Dependencies / API |
| --- | --- | --- | --- |
| Gateway | 8080 | routing, CORS, correlation, docs | REST tới các service; không DB credentials |
| Auth | 8081 | session/profile/shop/member | Supabase Auth; auth-owned SQL contract |
| Catalog | 8082 | product identity/category/units/supplier quotes | catalog-owned SQL contract; `/api/v1/products`, categories/suppliers |
| Inventory | 8083 | stock/imports/count/movement/valuation | inventory SQL contract; legacy stock còn `products.stock_base` |
| Sales | 8084 | checkout/cancellation/items | atomic SQL contract đọc Catalog, đổi Inventory/Debt trong một DB transaction |
| Debt | 8085 | customer/balances/payment/allocation | debt SQL contract; customer/credit history |
| Reporting | 8086 | read-only aggregates | bounded reporting contract; không aggregate trong browser |
| Admin | 8087 | platform lifecycle/audit/security | MFA/active Admin; privileged server integration |

Các service có entry point/package/Dockerfile/tests/OpenAPI riêng. Một PostgreSQL hiện tại, quyền riêng từng runtime role, API schema riêng. Business runtime role không có arbitrary table access; chỉ function contract đã whitelist. Không cross-import repositories. Schema/RPC cũ là transaction kernel tạm thời; physical table split và DB-per-service là giai đoạn sau. Shared-DB atomic checkout là **coupling có chủ đích cần ghi nhận**, không tuyên bố đã đạt DB-per-service hoặc xóa mọi coupling. Không broker/Kubernetes/Redis mới.

Cookie Auth: access/refresh được bảo vệ bằng HttpOnly, SameSite và Secure trong production, payload mã hóa; không trả refresh token vào JSON/localStorage. Cookie mutations kiểm tra Origin và CSRF header. Mỗi service xác minh identity; SQL kiểm tra lại shop/owner/staff. Frontend chỉ chuyển sang Gateway khi domain tương ứng đã đạt tests. Sau domain cuối mới thu hồi toàn bộ đường browser DB cũ và xóa SDK/legacy business logic.

## Kế hoạch và trạng thái

1. Audit và boundary (file này): đã đọc nguồn yêu cầu, rà source/domain/DB.
2. Foundation + Gateway + Auth; unit/HTTP/OpenAPI/security tests.
3. Catalog contract/DTO/SQL role và tests, sau đó frontend Catalog adapter.
4. Inventory → Sales → Debt → Reporting → Admin, tuần tự có regression.
5. Cutover frontend Auth/cookie, remove direct DB/SDK/legacy calculations, khóa browser DB access.
6. Docker build/run, test fixture riêng, data verify, tài liệu bàn giao A–O.

Chỉ đánh dấu từng bước khi có chứng cứ. Không dùng `db:reset`, không tự chạy lại container đã tắt, không chạm tài khoản/shop thật để test hoặc bootstrap Admin.
