# Tạp hóa BIN — báo cáo triển khai A–Q

Cập nhật 05/10/2026 tại `D:/little_store_fe`. Báo cáo đáp ứng cấu trúc mục 130 của yêu cầu, gồm cả P và Q. **Chưa phải biên bản nghiệm thu production hoặc xác nhận mọi tiêu chí 1–165 đã hoàn tất.** Đã sao lưu và áp 33 migration trên Supabase local do người dùng mở; 504 kiểm tra DB và luồng Auth/PostgREST/Edge/MFA thật đạt. Xem [nghiệm thu local](LOCAL_SUPABASE_ACCEPTANCE.md).

Nguồn yêu cầu: hai file `pasted-text-1.txt` và `pasted-text-2.txt` trong attachment `9c2a022a-50df-4aac-bfd5-bed298fea172`. [Audit trước triển khai](PLATFORM_ARCHITECTURE_AUDIT.md) giữ nguyên để đối chiếu; [trạng thái hiện tại](CLOUD_IMPLEMENTATION_STATUS.md) được cập nhật sau từng phần. Các đề xuất đặt tên/thư mục trong tài liệu được đối chiếu với hệ thống đang có, không được hiểu thành lệnh đổi tên/drop toàn bộ schema.

## A. System before

Tại thời điểm audit đầu: React 19/Vite/Tailwind/Zustand, JavaScript/JSX; các trang thao tác chủ yếu trên `useShopStore`/localStorage dù DB đã có nhiều RPC. Auth đã có Supabase SDK, chưa có Platform Admin/MFA và lifecycle account/member/shop hoàn chỉnh. UI và DB có nguy cơ lệch tồn/nợ, client còn tự quyết định nghiệp vụ local. Mô hình đơn vị, giao diện tạp hóa, CSV, backup, máy tính và các luồng bán/nhập/nợ/hủy cần được bảo toàn.

## B. Database changes

Không rename/drop các bảng nghiệp vụ để khớp sơ đồ. Tên vật lý tương đương:

| Sơ đồ yêu cầu | Bảng/cột đang dùng |
| --- | --- |
| shops, shop_members | stores, store_members |
| stock_imports, stock_import_items | stock_receipts, stock_receipt_items |
| inventory_movements | stock_movements |
| debts | sales.outstanding_amount + customers.current_debt + payment_allocations; nợ mở đầu đánh dấu is_legacy_opening |

Các nhóm bổ sung sau schema ban đầu:

- Catalog: `catalog_import_batches`, `product_source_quotes`, `categories`, `suppliers`, `product_batches`.
- Vốn/kiểm kê: `inventory_counts`, `inventory_count_items`, `inventory_adjustment_valuations`, `opening_cost_valuations`.
- Platform: `platform_admins`, `admin_audit_logs`, `security_events`, `admin_reset_deliveries`, `admin_action_admissions`, `admin_action_rate_windows`.
- Chuyển dữ liệu: `legacy_import_batches`, `legacy_product_links`, `legacy_customer_links`, `legacy_history_entries`.
- Chống trùng/phiên bản: `customer_create_requests`, `stock_csv_imports`, `sale_cancellation_requests`, `product_save_requests`, `reviewed_sale_requests`, `store_configuration_requests`.

Các cột đáng chú ý: business_type/status/timezone của cửa hàng, account_status của profile, membership active và quyền bán/nhập/nợ, version kiểm tra ghi đè; category/supplier liên kết theo store; stock_base/base_unit/factor; average_cost_per_base; cost snapshot của sale_items; mã lý do và request/hash của movement; legacy marker.

Tiền giữ bigint VNĐ, tồn nguyên đơn vị gốc; weighted fruit/Hạt mới dùng gram. Decimal nhập/bán được chuyển chính xác sang base quantity nguyên tại server. FK composite `(store_id, id)` ngăn gắn dữ liệu tenant khác. Constraints giữ giá/số lượng/quy cách/role hợp lệ. Index phục vụ membership active, tenant-stock, lịch sử theo thời gian, request uniqueness và Admin filter/rate windows; xem SQL cụ thể ở C.

RLS bật trên business và Admin tables. Direct writes tiền/kho/nợ bị thu hồi; RPC `SECURITY DEFINER`, `search_path=''`, kiểm tra người gọi/quyền/tài khoản/cửa hàng trước ghi và retry. Views `product_catalog`/`customer_debt_summary` dùng `security_invoker`. Quyền xem giá nhập/vốn tách owner khỏi staff. Admin RPC chỉ cấp execute cho backend service-role và kiểm tra active Admin.

RPC nghiệp vụ: catalog/product/customer, create/reviewed sale, receive_stock/CSV, record_debt_payment, cancellation preview/confirm, adjust_stock, inventory count, opening cost, legacy import/reconcile, history pagination, settings/staff, management_report/shop_dashboard. RPC Admin: đọc aggregate/list/detail, admission hạn mức, trạng thái shop/user/Admin, reset email journal. Không viết lại thành một server Node khác.

## C. Migration files

Toàn bộ 33 migration, theo thứ tự tên, dưới `D:/little_store_fe/backend/supabase/migrations/`:

- [202609210001_initial_store_schema.sql](D:/little_store_fe/backend/supabase/migrations/202609210001_initial_store_schema.sql)
- [202609210002_transaction_functions.sql](D:/little_store_fe/backend/supabase/migrations/202609210002_transaction_functions.sql)
- [202609210003_catalog_functions.sql](D:/little_store_fe/backend/supabase/migrations/202609210003_catalog_functions.sql)
- [202609260001_catalog_import.sql](D:/little_store_fe/backend/supabase/migrations/202609260001_catalog_import.sql)
- [202610040001_multi_business_fruit.sql](D:/little_store_fe/backend/supabase/migrations/202610040001_multi_business_fruit.sql)
- [202610050001_cost_inventory_count.sql](D:/little_store_fe/backend/supabase/migrations/202610050001_cost_inventory_count.sql)
- [202610050002_opening_cost.sql](D:/little_store_fe/backend/supabase/migrations/202610050002_opening_cost.sql)
- [202610050003_management_report.sql](D:/little_store_fe/backend/supabase/migrations/202610050003_management_report.sql)
- [202610050004_access_status_admin_foundation.sql](D:/little_store_fe/backend/supabase/migrations/202610050004_access_status_admin_foundation.sql)
- [202610050005_admin_actions.sql](D:/little_store_fe/backend/supabase/migrations/202610050005_admin_actions.sql)
- [202610050006_admin_reads.sql](D:/little_store_fe/backend/supabase/migrations/202610050006_admin_reads.sql)
- [202610050007_admin_security_and_reset.sql](D:/little_store_fe/backend/supabase/migrations/202610050007_admin_security_and_reset.sql)
- [202610050008_legacy_snapshot_import.sql](D:/little_store_fe/backend/supabase/migrations/202610050008_legacy_snapshot_import.sql)
- [202610050009_legacy_import_uuid_fix.sql](D:/little_store_fe/backend/supabase/migrations/202610050009_legacy_import_uuid_fix.sql)
- [202610050010_report_excludes_legacy_opening.sql](D:/little_store_fe/backend/supabase/migrations/202610050010_report_excludes_legacy_opening.sql)
- [202610050011_legacy_status_member_read.sql](D:/little_store_fe/backend/supabase/migrations/202610050011_legacy_status_member_read.sql)
- [202610050012_customer_book_idempotency.sql](D:/little_store_fe/backend/supabase/migrations/202610050012_customer_book_idempotency.sql)
- [202610050013_csv_stock_import.sql](D:/little_store_fe/backend/supabase/migrations/202610050013_csv_stock_import.sql)
- [202610050014_confirmed_sale_cancellation.sql](D:/little_store_fe/backend/supabase/migrations/202610050014_confirmed_sale_cancellation.sql)
- [202610050015_product_save_idempotency.sql](D:/little_store_fe/backend/supabase/migrations/202610050015_product_save_idempotency.sql)
- [202610050016_inventory_review.sql](D:/little_store_fe/backend/supabase/migrations/202610050016_inventory_review.sql)
- [202610050017_paginated_activity.sql](D:/little_store_fe/backend/supabase/migrations/202610050017_paginated_activity.sql)
- [202610050018_reviewed_sale.sql](D:/little_store_fe/backend/supabase/migrations/202610050018_reviewed_sale.sql)
- [202610050019_admin_reset_delivery.sql](D:/little_store_fe/backend/supabase/migrations/202610050019_admin_reset_delivery.sql)
- [202610050020_shop_staff_settings.sql](D:/little_store_fe/backend/supabase/migrations/202610050020_shop_staff_settings.sql)
- [202610050021_activity_staff_permissions.sql](D:/little_store_fe/backend/supabase/migrations/202610050021_activity_staff_permissions.sql)
- [202610050022_rpc_permission_admission.sql](D:/little_store_fe/backend/supabase/migrations/202610050022_rpc_permission_admission.sql)
- [202610050023_admin_filtered_reads.sql](D:/little_store_fe/backend/supabase/migrations/202610050023_admin_filtered_reads.sql)
- [202610050024_admin_action_rate_limits.sql](D:/little_store_fe/backend/supabase/migrations/202610050024_admin_action_rate_limits.sql)
- [202610050025_admin_detail_reads.sql](D:/little_store_fe/backend/supabase/migrations/202610050025_admin_detail_reads.sql)
- [202610050026_seed_weight_units.sql](D:/little_store_fe/backend/supabase/migrations/202610050026_seed_weight_units.sql)
- [202610050027_owner_dashboard.sql](D:/little_store_fe/backend/supabase/migrations/202610050027_owner_dashboard.sql)
- [202610050028_catalog_purchase_privacy.sql](D:/little_store_fe/backend/supabase/migrations/202610050028_catalog_purchase_privacy.sql)

Mỗi lần áp phải dùng migration history của Supabase, không phát lại thủ công mọi SQL trên DB đang có dữ liệu. Không chỉnh migration đã áp chỉ để đạt kết quả test; phần nâng cấp là migration tiếp theo. Chạy isolated test không có nghĩa migration đã áp lên Supabase đang dùng.

## D. Grocery support

Một kho gốc, nhiều đơn vị và giá độc lập: nước lon/chai-thùng, bia lon-thùng, thuốc lá gói-cây, gia vị theo đơn vị, Hạt mới gram/kg/lạng, bánh kẹo thùng/bịch/gói/cái/viên. Bán nhiều đơn vị cùng mặt hàng dùng chung tồn; không suy giá thùng từ giá lẻ. Nhập hàng cập nhật đúng quote của đơn vị nhập và bình quân vốn, giữ giá bán độc lập. Legacy Hạt lạng và quy cách bánh kẹo cũ không tự chuyển số dư.

File chính: `productPricing.js`, `productMapper.js`, `PricingFields.jsx`, `stockCsv.js`, product/sales/inventory services và SQL catalog/transaction. Chi tiết: [bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md). Các ví dụ số 99–109 được kiểm tra tại `acceptance_examples.test.sql` và `seed_weight.test.sql`; lưu ý sửa lỗi số học mục 102 bên dưới.

## E. Fruit support

Cân kg/lạng/gram, giá riêng và đơn vị đóng gói với factor rõ; hoặc đếm quả/trái/hộp/khay/túi/thùng. Cân lưu gram, quantity tối đa 3 chữ số thập phân và không nhận lượng dưới 1 gram. Đếm/đóng gói không được tự coi là cân. Danh mục riêng được giữ qua DB/CSV. Hư/thối ghi movement âm, snapshot vốn; dashboard nhóm số lượng theo base unit và giá trị NULL nếu thiếu vốn. Chi tiết: [đơn vị trái cây](FRUIT_UNIT_VARIANTS.md), [dashboard](OWNER_DASHBOARD.md).

## F. Sales

Page gửi intent gồm product/unit/quantity, customer/payment type, request ID và phiên bản quan sát. PostgreSQL admission quyền, khóa hàng, kiểm tra tồn/quy cách/giá/phiên bản; tính thành tiền, tạo sale/items snapshot, trừ stock, ghi movement và cộng nợ trong một transaction. Lỗi rollback toàn bộ. ID + intent hash chống replay khác nội dung; retry commit trả kết quả cũ. Session journal giữ UUID/hash để mất mạng sau commit có thể thử lại cùng intent, không lưu số dư.

Hủy cloud dùng server preview với snapshot lịch sử trả nợ, xác nhận có token/request ID. Server hoàn đúng lượng từng dòng, giảm phần nợ còn lại và hoàn phần đã trả; hoàn vốn snapshot, không định giá lại theo quote hiện tại. Hủy không lặp. Quyền/account/shop được kiểm tra trước cả retry đã commit.

## G. Inventory

Nhập hàng/CSV qua RPC atomic, tính tổng nhập và WAC, ghi receipt/items/movement. CSV không trực tiếp PATCH stock. Đổi quy cách bị chặn khi tồn/lịch sử không cho phép. Kiểm kê nhiều hàng cần actual base quantity, observed version, lý do; chênh lệch ghi ledger. Hao hụt/dùng riêng có mã lý do/request ID. Owner có thể định giá tồn cũ chưa rõ vốn một lần với audit. Không silent update số dư/lịch sử. `product_batches` chỉ là nền schema, chưa có FIFO/expiry/allocation hoàn chỉnh.

## H. Debt

Bán chịu tạo customer/debt qua RPC. Trả nợ lock khách và phân bổ vào đơn cũ nhất, cập nhật balance/outstanding/allocation cùng transaction; không nhận vượt nợ. Tiền thu nợ chỉ cộng cash, không cộng revenue lần nữa. Trả hết ẩn khách khỏi sổ hiện hành; DB giữ record để đối chiếu/hủy/lịch sử, không hard-delete khách có giao dịch. Staff quản lý nợ cần quyền riêng.

## I. COGS / profit

Nhập kho dùng bình quân gia quyền theo base unit; sale_items lưu cost_per_base/cost_total tại lúc bán. Báo cáo doanh thu trừ COGS snapshot, đảo phần của đơn hủy vào ngày hủy; cash gồm trả ngay/thu nợ trừ hoàn tiền. Giá vốn không rõ giữ NULL, không coi là 0. Gross margin do DB tính `gross_profit / revenue × 100`, NULL nếu chưa đủ vốn hoặc revenue=0. Hư/thối định giá theo snapshot adjustment riêng. Gross profit chưa trừ hao hụt/chi phí vận hành, không phải net profit.

## J. Platform Admin

Auth thật, platform_admins tách shop owner, AAL2/TOTP bắt buộc. Không public Admin signup, bootstrap đầu tiên bằng người có quyền DB tin cậy. Edge xác minh JWT qua Auth, active Admin/AAL2, validation; RPC kiểm tra lại active Admin. Có dashboard, Shops/List/Detail, Users/List/Detail, Admins, Security, Audit, System, Settings, MFA setup/challenge và layout riêng.

Shop: suspend/restore/archive với audit; ghi nghiệp vụ bị chặn tại DB khi suspended/archived. User: disable/enable, đồng bộ Auth ban/unban và reset email có lease/journal. Admin: cấp/vô hiệu tài khoản có sẵn, bảo vệ Admin cuối. Lists có filter/sort/date/pagination tại server; detail chỉ metadata và liên quan được whitelist. Health phản ánh DB/Auth/Edge request thực, không uptime giả. Không impersonation, không mặc định trả customer PII/chi tiết sale của cửa hàng.

## K. Frontend

JavaScript/JSX giữ nguyên, UX hiện tại được nối từng domain:

| Nhóm file | Trách nhiệm |
| --- | --- |
| src/lib/supabase*.js | Public client/config |
| src/auth/*, services/authService.js, storeService.js, accountSession.js, stores/useAccountStore.js | Auth/phiên/shop/gates |
| src/services/*Service.js, src/repositories/*, src/mappers/* | Service–repository–mapper |
| src/services/cloudCommandRunner.js, requestJournal.js | Retry/idempotency và response theo phiên |
| src/stores/useCloudShopStore.js, useActiveShopStore.js, useShopStore.js | Cloud RAM, demo/legacy và giỏ tạm |
| src/pages/SalesPages.jsx, StockPages.jsx, DebtPages.jsx, CsvImportPage.jsx | Bán/kho/nợ/nhập giữ luồng cũ |
| src/pages/LegacyMigrationPage.jsx, services/legacy* | Backup/preflight/import/reconcile |
| src/pages/InventoryCountPage.jsx, components/StockTools.jsx | Kiểm kê/điều chỉnh/vốn |
| src/pages/CategoriesPage.jsx, SuppliersPage.jsx, ShopSettingsPage.jsx | Danh mục/NCC/nhân viên/cài đặt |
| src/pages/home/*, pages/RevenuePage.jsx, hooks/useOwnerDashboard.js | Aggregate báo cáo owner |
| src/admin/*, App.jsx/routePages.js | Portal Admin riêng, routes lazy loading |
| src/components/PricingFields.jsx, utils/productPricing.js, stockCsv.js | Multi-unit, trọng lượng, CSV |

Chi tiết từng phần và file mới/sửa nằm trong các tài liệu domain liên kết ở [CLOUD_IMPLEMENTATION_STATUS.md](CLOUD_IMPLEMENTATION_STATUS.md). Worktree chứa nhiều thay đổi từ trước, chưa gom commit và không reset.

## L. Security

- RLS lọc membership active và profile active. Dữ liệu liên kết/commands có store_id/FK theo tenant, DB không tin store_id/role/price/số dư do UI tự khai.
- Service-role chỉ đọc từ môi trường Edge, không đưa vào VITE env/bundle. Public config từ chối secret/service-role key. RPC Admin service-only, không bỏ kiểm tra actor.
- JWT được Auth xác minh; AAL2 và active Admin bắt buộc. SQL không nhận actor từ browser trực tiếp cho quyền service-role; Edge lấy UUID đã xác minh.
- Validation giới hạn resource/action/status/UUID/page/date/query/note, SQL order whitelist và parameter binding. React render text; không render JSON/log bằng HTML tùy ý. UI validation là tiện ích, DB/Edge vẫn enforce.
- Action nguy hiểm có lý do/xác nhận, UUID/hash retry; business mutation và audit cùng transaction. Rate admission là transaction riêng để downstream fail không rollback bộ đếm; 10 intent mới/3 thay đổi Admin/30 attempts trong cửa sổ trượt 60s theo actor.
- Error public dùng application code và câu tiếng Việt cố định, không trả SQL/hint/provider message; mã/cause được giữ nội bộ. Metadata Admin được whitelist, reset tokens/password/secrets không ghi log UI.

Migration 028 bảo vệ giá nhập ở view/helper/cột Data API; nhân viên mặc định không đọc được giá nhập, lịch sử vốn phiếu nhập chỉ owner đọc. Đây là các biện pháp có trong mã và test, không phải cam kết “hoàn toàn an toàn”. HTTP/Auth/MFA/Edge local đã chạy; production còn cần nghiệm thu.

## M. Tests

| Lệnh | Kết quả gần nhất |
| --- | --- |
| npm test | 141/141 JS tests đạt |
| npm run lint | Đạt, không cảnh báo |
| npm run build | Đạt |
| npm run db:test trên Supabase local | 33 migration, 504/504 pgTAP assertions đạt |
| npm run test:integration | 43 kiểm tra Shop HTTP; Admin Auth/MFA/ban/unban/retry/429 đạt |
| npm run db:test:isolated với PGTAP_SQL | 32 migration, 487/487 pgTAP assertions đạt |
| Isolated native/concurrency (trong lệnh trên) | Duplicate sale, tranh tồn, tranh trả nợ, thu hồi staff và tranh slot Admin đạt |

Lần kiểm tra PostgreSQL 18 tạm trước đó dùng mock auth.users/auth.uid, đã dừng/xóa own data; log giữ ở `C:/Users/user/AppData/Local/Temp/taphoa-sql-validation-rNZjkw`. Lần mới đã gọi Supabase Auth/PostgREST/Edge/MFA thật trên local, không gửi email hoặc thao tác browser. [Hướng dẫn kiểm tra DB](DATABASE_TESTING.md), [kết quả và bảo toàn dữ liệu](LOCAL_SUPABASE_ACCEPTANCE.md).

**Điểm đã đối chiếu:** ví dụ mục 102 ghi tồn 100 lon, bán 2 thùng × 24 + 4 lon nhưng kỳ vọng “52 remaining”. Phép tính đúng là bán 52, còn **48**. `acceptance_examples.test.sql` có 34 assertion cho số cụ thể Coca/Tiger/thuốc lá/nhập/fruit/hao hụt/nợ/hủy, `seed_weight.test.sql` có ví dụ 5 kg bán 1,5 kg còn 3.500 gram. HTTP 400/403/200/429 đã kiểm tra trên Edge thật; không suy từ tổng số SQL tests.

Quét 170 file source/bundle trong `src/` và `dist/` không thấy literal `sb_secret_*` dài hoặc JWT có payload role=`service_role`; không in nội dung token. Đây là kiểm tra literal, không phải bảo đảm mọi secret có thể có đều được phát hiện.

## N. Manual Supabase steps

Chỉ thực hiện khi bạn chủ động mở môi trường cần dùng:

1. Sao lưu DB và bản legacy; kiểm tra đúng project/container/volume. Không reset dữ liệu để cập nhật schema.
2. Mở Docker khi bạn cần local. `npm run db:start`, `npm run db:migrate`, `npm run db:test`. Backend CLI/config nằm trong backend, root scripts chỉ chuyển tiếp.
3. Điền public URL/key vào `.env.local`, chạy `npm run backend:check` và frontend; không chép service-role vào frontend.
4. Cấu hình Auth email confirmation, redirect URL `/reset-password`, TOTP MFA. Test owner/staff/tenant khác/disabled/suspended bằng session thật.
5. Bootstrap Admin đầu bằng tài khoản Auth có sẵn và SQL tin cậy; cấu hình CORS/redirect và deploy/serve admin-api sau khi migration sẵn sàng. [Hướng dẫn Admin](ADMIN_BOOTSTRAP.md).
6. Chuyển legacy bằng wizard với backup/preflight/reconcile; đối chiếu số dư và history trước khi dùng dữ liệu thật. Không tự phát lại mọi hóa đơn cũ.
7. Local đã kiểm tra retry cùng ID, MFA AAL2, quyền staff/tenant và Admin ban/unban bằng fixture riêng. Vẫn cần kiểm tra browser mất mạng sau commit, email và cấu hình production trước khi đưa vào sử dụng thực tế.

## O. Environment variables

Frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` hoặc fallback `VITE_SUPABASE_ANON_KEY`. Chỉ public key. Vite đọc `.env.local`, không commit nội dung thật. Supabase SDK quản lý auth session/token; dữ liệu money/stock/debt cloud không persist local.

Edge: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` hoặc `SUPABASE_ANON_KEY`, **`SUPABASE_SERVICE_ROLE_KEY` chỉ server**, `ADMIN_ALLOWED_ORIGINS`, `ADMIN_PUBLIC_APP_ORIGIN` (khi tác vụ không có Origin). Dùng Secret manager/môi trường Edge, không đưa vào source/build/VITE. Không có giá trị secret thật trong báo cáo này.

Isolated test: `PG_BIN`, `PG_VALIDATION_PORT`, `PGTAP_SQL` là đường dẫn/port test, không phải thông tin kết nối DB cửa hàng.

## P. Deployment order

Backup → đối chiếu migration → áp schema/RLS/RPC → kiểm tra quyền DB → cấu hình/serve/deploy Edge → frontend build/config → JS/SQL/HTTP/Auth/MFA tests → verify số dư và dashboard với dữ liệu được chọn. Không deploy frontend gọi RPC mới trước khi DB/Edge tương ứng sẵn sàng. Không tự bật stack sau restart.

## Q. Known limitations / remaining acceptance

- Supabase local đã áp SQL và nghiệm thu các luồng trong [báo cáo local](LOCAL_SUPABASE_ACCEPTANCE.md); production chưa triển khai. Stack do người dùng mở, không cấu hình tự bật.
- Có [bảng đối chiếu đủ 165 mục](REQUIREMENTS_165_CROSSWALK.md) với evidence và phần cần integration/browser QA. Chưa xác nhận toàn bộ acceptance đạt; không quy tổng số assertions thành 165/165 yêu cầu đạt.
- Auth service và PostgreSQL không chung transaction. Ban/unban DB chặn ngay; Edge đồng bộ Auth và retry/đối chiếu. Hai action trái ngược đồng thời còn cần đối chiếu Auth cuối cùng.
- Reset email lease chống gửi song song, nhưng crash sau Auth chấp nhận gửi trước khi đánh dấu sent có thể gửi lại sau lease; không hứa exactly-once email/delivery.
- Giá vốn legacy không thể phục dựng nếu thiếu nguồn. Import snapshot tồn/nợ và archive lịch sử, không biến nợ mở đầu thành doanh thu mới.
- Cloud catalog/cache hiện nạp tối đa 10.000 rows trước khi báo giới hạn. History/Admin được phân trang server, dashboard aggregate/list nhỏ; chưa có lazy catalog vô hạn hoặc realtime đồng bộ nhiều máy.
- Dashboard là lần đọc hiện tại và refresh bằng nạp dữ liệu/nút cập nhật. Chưa tự refresh theo realtime giữa thiết bị hoặc cam kết uptime/60 FPS trên mọi máy.
- Batch/FIFO/expiry chưa triển khai đầy đủ vì optional/future trong yêu cầu. Custom report range chưa có vì scope optional; hiện 7/30/90 ngày và dashboard hôm nay.
- Giao diện chưa có browser thao tác QA trong lần này theo yêu cầu người dùng. Chưa chuyển dữ liệu thật, tạo Admin thật, gửi mail hoặc deploy.

Phần tiếp theo cần ưu tiên: đối chiếu số dư bằng dữ liệu thực được chọn, nghiệm thu browser/email và triển khai production. Các nhánh ngoài phạm vi báo cáo local vẫn giữ trạng thái chờ trong bảng đối chiếu.
