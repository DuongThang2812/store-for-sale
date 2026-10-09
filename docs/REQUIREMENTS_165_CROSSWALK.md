# Đối chiếu 165 mục yêu cầu — Tạp hóa BIN

Ngày 05/10/2026. Bảng giữ nguyên số và tiêu đề từ hai attachment yêu cầu, 165 mục duy nhất, không bỏ mục nào. Đây là bản đồ evidence để nghiệm thu, **không phải kết luận 165/165 đã đạt**.

- **Mã**: đã có phần triển khai được dẫn; không đồng nghĩa mọi nhánh UI/HTTP đã chạy thử.
- **SQL/JS**: tổng hiện tại 504 pgTAP trên Supabase local/141 JS trên Node, không quy đổi thành số yêu cầu đạt.
- **I**: cần đối chiếu phạm vi integration. Local đã nghiệm thu Auth/PostgREST/Edge/MFA/quyền/retry của các luồng trong [báo cáo local](LOCAL_SUPABASE_ACCEPTANCE.md); dấu I không có nghĩa mọi nhánh HTTP của mục đó đã đạt. Production/email và nhánh chưa được liệt kê còn chờ.
- **U**: còn nghiệm thu thao tác trình duyệt; không chạy browser QA theo yêu cầu người dùng.
- **Tương đương/đối chiếu**: giữ tên/schema/thư mục đang có, có giải thích trade-off; phần cấu trúc đề xuất không buộc rename/drop toàn bộ.

Mọi đường dẫn code/test rút gọn trong bảng nằm dưới `D:/little_store_fe/src/`, `D:/little_store_fe/tests/` hoặc `D:/little_store_fe/backend/supabase/`. [Báo cáo A–Q](PLATFORM_IMPLEMENTATION_REPORT.md) liệt kê migration thật, file trách nhiệm, các bước deployment và giới hạn.

| Mục | Tiêu đề nguyên văn | Trạng thái evidence | File / đối chiếu |
| --- | --- | --- | --- |
| 1 | ĐỌC PROJECT TRƯỚC KHI CODE | Đối chiếu | [Audit ban đầu](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A/K](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 2 | NGUYÊN TẮC QUAN TRỌNG NHẤT | Đối chiếu | [Audit ban đầu](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A/K](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 3 | BUSINESS TYPE | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 4 | SHOP ROLE | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 5 | PLATFORM ADMIN KHÁC SHOP OWNER | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 6 | DATABASE - SHOPS | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 7 | DATABASE - SHOP MEMBERS | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 8 | PROFILE | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 9 | CATEGORY | Mã + SQL; I | [Trạng thái quyền/shop](CLOUD_IMPLEMENTATION_STATUS.md), schema/RLS/membership |
| 10 | GROCERY LÀ BUSINESS TYPE FIRST-CLASS | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 11 | GROCERY - BÁNH KẸO | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 12 | GROCERY - NƯỚC | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 13 | GROCERY - BIA | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 14 | GROCERY - THUỐC LÁ | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 15 | GROCERY - HẠT | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 16 | GROCERY - GIA VỊ | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 17 | PRODUCT MODEL | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 18 | SINGLE SOURCE OF STOCK | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 19 | MIXED UNIT SALE | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 20 | MULTI-UNIT PRICING | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 21 | PURCHASE PRICING | Mã + SQL/JS; I/U | [Bánh kẹo](SNACK_MULTI_UNITS.md), [Hạt](SEED_WEIGHT_UNITS.md), productPricing/productMapper |
| 22 | FRUIT SHOP | Mã + SQL/JS; I/U | [Trái cây](FRUIT_UNIT_VARIANTS.md), fruit_unit_variants.test.sql |
| 23 | DECIMAL QUANTITY | Mã + SQL/JS; I/U | [Trái cây](FRUIT_UNIT_VARIANTS.md), fruit_unit_variants.test.sql |
| 24 | DATABASE SOURCE OF TRUTH | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 25 | PRODUCTS → SUPABASE | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 26 | CUSTOMERS → SUPABASE | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 27 | SALES | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 28 | SALE ITEMS | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 29 | ATOMIC CHECKOUT | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 30 | CHECKOUT RPC | Mã + SQL/JS; I/U | [Service/Repository/RPC](CLOUD_IMPLEMENTATION_STATUS.md), reviewed sale/admission |
| 31 | CREDIT SALE | Mã + SQL/JS; I/U | [Báo cáo F/H](PLATFORM_IMPLEMENTATION_REPORT.md), payment/cancellation tests |
| 32 | DEBT PAYMENT | Mã + SQL/JS; I/U | [Báo cáo F/H](PLATFORM_IMPLEMENTATION_REPORT.md), payment/cancellation tests |
| 33 | SALE CANCELLATION | Mã + SQL/JS; I/U | [Báo cáo F/H](PLATFORM_IMPLEMENTATION_REPORT.md), payment/cancellation tests |
| 34 | STOCK IMPORT | Mã + SQL/JS; I/U | [Kho/CSV/ledger](CLOUD_IMPLEMENTATION_STATUS.md), inventoryService |
| 35 | INVENTORY MOVEMENTS | Mã + SQL/JS; I/U | [Kho/CSV/ledger](CLOUD_IMPLEMENTATION_STATUS.md), inventoryService |
| 36 | KHÔNG SILENT STOCK UPDATE | Mã + SQL/JS; I/U | [Kho/CSV/ledger](CLOUD_IMPLEMENTATION_STATUS.md), inventoryService |
| 37 | WEIGHTED AVERAGE COST | Mã + SQL; I | [Giá vốn/lãi](PLATFORM_IMPLEMENTATION_REPORT.md), cost_inventory_count.test.sql |
| 38 | COGS | Mã + SQL; I | [Giá vốn/lãi](PLATFORM_IMPLEMENTATION_REPORT.md), cost_inventory_count.test.sql |
| 39 | GROSS PROFIT | Mã + SQL; I | [Giá vốn/lãi](PLATFORM_IMPLEMENTATION_REPORT.md), cost_inventory_count.test.sql |
| 40 | FRUIT SPOILAGE | Mã + SQL; I/U | [Kiểm kê](CLOUD_IMPLEMENTATION_STATUS.md), [dashboard hao hụt](OWNER_DASHBOARD.md) |
| 41 | GROCERY DAMAGE | Mã + SQL; I/U | [Kiểm kê](CLOUD_IMPLEMENTATION_STATUS.md), [dashboard hao hụt](OWNER_DASHBOARD.md) |
| 42 | INVENTORY COUNT | Mã + SQL; I/U | [Kiểm kê](CLOUD_IMPLEMENTATION_STATUS.md), [dashboard hao hụt](OWNER_DASHBOARD.md) |
| 43 | SUPPLIERS | Mã + SQL/JS; I/U | supplierService/SuppliersPage, tenant FK/RLS |
| 44 | REVENUE PAGE | Mã + SQL/JS; I/U | [Dashboard & margin](OWNER_DASHBOARD.md), owner_dashboard.test.sql |
| 45 | GROCERY DASHBOARD | Mã + SQL/JS; I/U | [Dashboard & margin](OWNER_DASHBOARD.md), owner_dashboard.test.sql |
| 46 | FRUIT DASHBOARD | Mã + SQL/JS; I/U | [Dashboard & margin](OWNER_DASHBOARD.md), owner_dashboard.test.sql |
| 47 | SHOP SUSPENDED | Mã + SQL; I | access_status_admin_foundation/auth_isolation tests, admission ...022 |
| 48 | RLS | Mã + SQL; I | access_status_admin_foundation/auth_isolation tests, admission ...022 |
| 49 | LOCALSTORAGE MIGRATION | Mã + SQL/JS; I/U | [Chuyển legacy](CLOUD_IMPLEMENTATION_STATUS.md), legacy snapshot/import tests |
| 50 | PLATFORM ADMIN DATABASE | Mã + SQL; I | platform_admins/admin_audit_logs/security_events migrations |
| 51 | FIRST ADMIN | Thủ công chưa chạy | [Bootstrap tin cậy](ADMIN_BOOTSTRAP.md), chưa tạo Admin thật |
| 52 | MFA ADMIN | Mã; I/U | AdminMfaPages/AdminAccessGate; TOTP/AAL2 thật chưa nghiệm thu |
| 53 | SERVICE ROLE | Mã + JS + scan | supabaseConfig/Edge server env; quét src/dist không thấy secret literal |
| 54 | ADMIN BACKEND ARCHITECTURE | Mã + SQL/JS; I | [Admin admission/audit](ADMIN_RATE_LIMITS.md), Edge actions/RPC |
| 55 | ADMIN AUDIT LOG | Mã + SQL/JS; I | [Admin admission/audit](ADMIN_RATE_LIMITS.md), Edge actions/RPC |
| 56 | ADMIN ACTION + AUDIT ATOMIC | Mã + SQL/JS; I | [Admin admission/audit](ADMIN_RATE_LIMITS.md), Edge actions/RPC |
| 57 | ADMIN ROUTES | Mã; I/U | AdminLayout/AdminPages, [System Health](OWNER_DASHBOARD.md) |
| 58 | ADMIN SIDEBAR | Mã; I/U | AdminLayout/AdminPages, [System Health](OWNER_DASHBOARD.md) |
| 59 | ADMIN DASHBOARD | Mã; I/U | AdminLayout/AdminPages, [System Health](OWNER_DASHBOARD.md) |
| 60 | ADMIN DASHBOARD UI | Mã; I/U | AdminLayout/AdminPages, [System Health](OWNER_DASHBOARD.md) |
| 61 | ADMIN SHOPS | Mã + SQL; I/U | [Shops/filter/detail/status](ADMIN_DETAIL_PAGES.md), admin_actions/admin_filtered tests |
| 62 | ADMIN SHOP DETAIL | Mã + SQL; I/U | [Shops/filter/detail/status](ADMIN_DETAIL_PAGES.md), admin_actions/admin_filtered tests |
| 63 | SUSPEND SHOP | Mã + SQL; I/U | [Shops/filter/detail/status](ADMIN_DETAIL_PAGES.md), admin_actions/admin_filtered tests |
| 64 | RESTORE SHOP | Mã + SQL; I/U | [Shops/filter/detail/status](ADMIN_DETAIL_PAGES.md), admin_actions/admin_filtered tests |
| 65 | ARCHIVE SHOP | Mã + SQL; I/U | [Shops/filter/detail/status](ADMIN_DETAIL_PAGES.md), admin_actions/admin_filtered tests |
| 66 | ADMIN USERS | Mã + SQL/JS; I/U | [Users/reset/Auth giới hạn](ADMIN_BOOTSTRAP.md), [detail](ADMIN_DETAIL_PAGES.md) |
| 67 | ADMIN USER DETAIL | Mã + SQL/JS; I/U | [Users/reset/Auth giới hạn](ADMIN_BOOTSTRAP.md), [detail](ADMIN_DETAIL_PAGES.md) |
| 68 | DISABLE USER | Mã + SQL/JS; I/U | [Users/reset/Auth giới hạn](ADMIN_BOOTSTRAP.md), [detail](ADMIN_DETAIL_PAGES.md) |
| 69 | ENABLE USER | Mã + SQL/JS; I/U | [Users/reset/Auth giới hạn](ADMIN_BOOTSTRAP.md), [detail](ADMIN_DETAIL_PAGES.md) |
| 70 | PASSWORD RESET | Mã + SQL/JS; I/U | [Users/reset/Auth giới hạn](ADMIN_BOOTSTRAP.md), [detail](ADMIN_DETAIL_PAGES.md) |
| 71 | PLATFORM ADMIN MANAGEMENT | Mã + SQL; I/U | admin_change_admin_status, last Admin protection; Edge vẫn cần integration |
| 72 | GRANT ADMIN | Mã + SQL; I/U | admin_change_admin_status, last Admin protection; Edge vẫn cần integration |
| 73 | LAST ADMIN PROTECTION | Mã + SQL; I/U | admin_change_admin_status, last Admin protection; Edge vẫn cần integration |
| 74 | SECURITY EVENTS | Mã + SQL; I/U | AdminSecurity/Audit/System, [metadata/filter](ADMIN_LIST_FILTERS.md), actual-request health |
| 75 | ADMIN SECURITY PAGE | Mã + SQL; I/U | AdminSecurity/Audit/System, [metadata/filter](ADMIN_LIST_FILTERS.md), actual-request health |
| 76 | AUDIT LOG PAGE | Mã + SQL; I/U | AdminSecurity/Audit/System, [metadata/filter](ADMIN_LIST_FILTERS.md), actual-request health |
| 77 | SYSTEM PAGE | Mã + SQL; I/U | AdminSecurity/Audit/System, [metadata/filter](ADMIN_LIST_FILTERS.md), actual-request health |
| 78 | ADMIN SYSTEM HEALTH API | Mã + SQL; I/U | AdminSecurity/Audit/System, [metadata/filter](ADMIN_LIST_FILTERS.md), actual-request health |
| 79 | ADMIN SETTINGS | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 80 | ADMIN PRIVACY | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 81 | KHÔNG IMPLEMENT ADMIN IMPERSONATION | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 82 | ADMIN PROTECTED ROUTE | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 83 | ADMIN API AUTH | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 84 | EDGE FUNCTION ADMIN HELPER | Mã; I/U | AdminSettings/AccessGate, Edge verifiedAdmin; không impersonation |
| 85 | ADMIN INPUT VALIDATION | Mã + SQL/JS; I | [Validation/rate](ADMIN_RATE_LIMITS.md), safe errors, action request/hash journal |
| 86 | XSS | Mã + SQL/JS; I | [Validation/rate](ADMIN_RATE_LIMITS.md), safe errors, action request/hash journal |
| 87 | SQL INJECTION | Mã + SQL/JS; I | [Validation/rate](ADMIN_RATE_LIMITS.md), safe errors, action request/hash journal |
| 88 | ADMIN RATE LIMIT | Mã + SQL/JS; I | [Validation/rate](ADMIN_RATE_LIMITS.md), safe errors, action request/hash journal |
| 89 | DOUBLE SUBMIT | Mã + SQL/JS; I | [Validation/rate](ADMIN_RATE_LIMITS.md), safe errors, action request/hash journal |
| 90 | PAGINATION | Mã + SQL; I | server pagination/indexes; chưa benchmark dữ liệu production |
| 91 | INDEXES | Mã + SQL; I | server pagination/indexes; chưa benchmark dữ liệu production |
| 92 | SHOP UI BUSINESS TYPE | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 93 | GROCERY INVENTORY UI | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 94 | GROCERY SALE UI | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 95 | FRUIT SALE UI | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 96 | GROCERY CSV | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 97 | ACTIVITY HISTORY | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 98 | BACKUP | Mã + SQL/JS; I/U | Shop pages, pricing/CSV/history, backup & legacy wizard; xem [file trách nhiệm](CLOUD_IMPLEMENTATION_STATUS.md) |
| 99 | TEST - GROCERY CASE 1 | SQL số cụ thể đạt | acceptance_examples.test.sql; mục 102 sửa kết quả còn 48, bán 52 |
| 100 | TEST - GROCERY MIXED UNIT | SQL số cụ thể đạt | acceptance_examples.test.sql; mục 102 sửa kết quả còn 48, bán 52 |
| 101 | TEST - GROCERY PRICE | SQL số cụ thể đạt | acceptance_examples.test.sql; mục 102 sửa kết quả còn 48, bán 52 |
| 102 | TEST - BIA | SQL số cụ thể đạt | acceptance_examples.test.sql; mục 102 sửa kết quả còn 48, bán 52 |
| 103 | TEST - THUỐC LÁ | SQL số cụ thể đạt | acceptance_examples.test.sql; mục 102 sửa kết quả còn 48, bán 52 |
| 104 | TEST - HẠT | SQL/JS số cụ thể đạt | [Hạt](SEED_WEIGHT_UNITS.md), seed_weight.test.sql: 5000 - 1500 = 3500 gram |
| 105 | TEST - PURCHASE | SQL số cụ thể đạt | acceptance_examples.test.sql: giá nhập/WAC, fruit COGS/lãi, spoilage, trả nợ/hủy |
| 106 | TEST - FRUIT | SQL số cụ thể đạt | acceptance_examples.test.sql: giá nhập/WAC, fruit COGS/lãi, spoilage, trả nợ/hủy |
| 107 | TEST - SPOILAGE | SQL số cụ thể đạt | acceptance_examples.test.sql: giá nhập/WAC, fruit COGS/lãi, spoilage, trả nợ/hủy |
| 108 | TEST - DEBT | SQL số cụ thể đạt | acceptance_examples.test.sql: giá nhập/WAC, fruit COGS/lãi, spoilage, trả nợ/hủy |
| 109 | TEST - CANCEL | SQL số cụ thể đạt | acceptance_examples.test.sql: giá nhập/WAC, fruit COGS/lãi, spoilage, trả nợ/hủy |
| 110 | TEST - SHOP ISOLATION | SQL isolation đạt; I | auth_isolation.test.sql, outsider tests; auth.uid được mock |
| 111 | TEST - ADMIN | Chờ integration HTTP | Edge verifiedAdmin có mã 401/403/AAL2; chưa chạy Supabase Auth/HTTP thật |
| 112 | TEST - SUSPEND SHOP | SQL đạt; I | access_status/admin_actions tests; last Admin và suspension ở DB |
| 113 | TEST - LAST ADMIN | SQL đạt; I | access_status/admin_actions tests; last Admin và suspension ở DB |
| 114 | TEST - SERVICE ROLE | Scan literal đạt | 170 file src/dist: không thấy sb_secret literal dài hoặc service_role JWT; không bảo đảm mọi dạng secret |
| 115 | TEST - LEGACY MIGRATION | SQL/JS đạt; I/U | legacy-migration/legacy_snapshot tests, [kết quả](DATABASE_TESTING.md) |
| 116 | AUTOMATED TEST | SQL/JS đạt; I/U | legacy-migration/legacy_snapshot tests, [kết quả](DATABASE_TESTING.md) |
| 117 | DATABASE MIGRATION FILES | Mã/cấu trúc | [Báo cáo C/K/P](PLATFORM_IMPLEMENTATION_REPORT.md), migration cộng thêm, backend/Admin riêng |
| 118 | MIGRATION SAFETY | Mã/cấu trúc | [Báo cáo C/K/P](PLATFORM_IMPLEMENTATION_REPORT.md), migration cộng thêm, backend/Admin riêng |
| 119 | BACKEND ORGANIZATION | Mã/cấu trúc | [Báo cáo C/K/P](PLATFORM_IMPLEMENTATION_REPORT.md), migration cộng thêm, backend/Admin riêng |
| 120 | ADMIN FRONTEND ORGANIZATION | Mã/cấu trúc | [Báo cáo C/K/P](PLATFORM_IMPLEMENTATION_REPORT.md), migration cộng thêm, backend/Admin riêng |
| 121 | ADMIN UI QUALITY | Có UI; U | layout/shared table/filter/dialog/status; chưa browser QA/không hứa 60 FPS mọi máy |
| 122 | ADMIN DANGEROUS ACTIONS | Mã + SQL/JS; I/U | ActionDialog/operation gates, staff settings/admission/version/retry tests |
| 123 | SHOP APP SECURITY | Mã + SQL/JS; I/U | ActionDialog/operation gates, staff settings/admission/version/retry tests |
| 124 | BUILD / LINT / TEST | Lệnh đạt | 141 JS, lint/build, 487 pgTAP; [kết quả/môi trường](DATABASE_TESTING.md) |
| 125 | IMPLEMENTATION ORDER | Theo từng domain; I | [Báo cáo triển khai P](PLATFORM_IMPLEMENTATION_REPORT.md); deployment thật chưa chạy |
| 126 | ACCEPTANCE CRITERIA - CORE | Chờ nghiệm thu tổng I/U | Core/grocery/fruit/Admin có mã và tests; chưa kết luận tất cả acceptance đạt |
| 127 | ACCEPTANCE CRITERIA - GROCERY | Chờ nghiệm thu tổng I/U | Core/grocery/fruit/Admin có mã và tests; chưa kết luận tất cả acceptance đạt |
| 128 | ACCEPTANCE CRITERIA - FRUIT | Chờ nghiệm thu tổng I/U | Core/grocery/fruit/Admin có mã và tests; chưa kết luận tất cả acceptance đạt |
| 129 | ACCEPTANCE CRITERIA - ADMIN | Chờ nghiệm thu tổng I/U | Core/grocery/fruit/Admin có mã và tests; chưa kết luận tất cả acceptance đạt |
| 130 | FINAL REPORT | Báo cáo A-Q hiện trạng | [Báo cáo A–Q](PLATFORM_IMPLEMENTATION_REPORT.md), nêu rõ cấu hình và giới hạn |
| 131 | NGUYÊN TẮC CUỐI | Đối chiếu nguyên tắc | Một codebase/core, hai business types, Admin layer riêng; không reset/hard delete |
| 132 | KIẾN TRÚC TỔNG THỂ ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 133 | FRONTEND FOLDER STRUCTURE ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 134 | STORE STRUCTURE ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 135 | SERVICE LAYER ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 136 | DATABASE STRUCTURE ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 137 | DATABASE RELATIONSHIP ĐỀ XUẤT | Tương đương, có giải thích | [Audit đề xuất](PLATFORM_ARCHITECTURE_AUDIT.md), [bảng tên vật lý/B](PLATFORM_IMPLEMENTATION_REPORT.md); batch optional |
| 138 | PRODUCTS STRUCTURE ĐỀ XUẤT | Mã + SQL/JS; I | products/product_units/sales/sale_items; model camelCase qua mapper, bigint/base integer |
| 139 | PRODUCT UNITS STRUCTURE | Mã + SQL/JS; I | products/product_units/sales/sale_items; model camelCase qua mapper, bigint/base integer |
| 140 | SALES STRUCTURE | Mã + SQL/JS; I | products/product_units/sales/sale_items; model camelCase qua mapper, bigint/base integer |
| 141 | SALE ITEMS STRUCTURE | Mã + SQL/JS; I | products/product_units/sales/sale_items; model camelCase qua mapper, bigint/base integer |
| 142 | INVENTORY MOVEMENT LÀ LEDGER | Mã + SQL; I | stock_movements, stock_receipts/items tenant FK, immutable financial snapshots |
| 143 | STOCK IMPORT STRUCTURE | Mã + SQL; I | stock_movements, stock_receipts/items tenant FK, immutable financial snapshots |
| 144 | DEBT STRUCTURE | Mô hình tương đương | sales.outstanding_amount/customers.current_debt/payment_allocations; không tạo bảng debts trùng số dư |
| 145 | ADMIN DATABASE STRUCTURE | Mã + SQL; I | Platform tables và stores.status; migration ...004/005/007 và guard |
| 146 | SHOP STATUS STRUCTURE | Mã + SQL; I | Platform tables và stores.status; migration ...004/005/007 và guard |
| 147 | POSTGRESQL FUNCTIONS / RPC STRUCTURE | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 148 | ADMIN BACKEND STRUCTURE | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 149 | ADMIN REQUEST FLOW | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 150 | SHOP REQUEST FLOW | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 151 | REPORTING STRUCTURE | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 152 | RLS ARCHITECTURE | Mã + SQL/JS; I | RPC/Edge/service/RLS, [báo cáo B/F/J/L](PLATFORM_IMPLEMENTATION_REPORT.md) |
| 153 | UI ROUTE STRUCTURE | Mã; I/U | App/routes/MainLayout/AdminLayout, [dashboard hiện tại](OWNER_DASHBOARD.md) |
| 154 | SHOP UI STRUCTURE | Mã; I/U | App/routes/MainLayout/AdminLayout, [dashboard hiện tại](OWNER_DASHBOARD.md) |
| 155 | ADMIN UI STRUCTURE | Mã; I/U | App/routes/MainLayout/AdminLayout, [dashboard hiện tại](OWNER_DASHBOARD.md) |
| 156 | SHOP DETAIL ADMIN UI | Mã + SQL/JS; I/U | [Admin detail](ADMIN_DETAIL_PAGES.md), pagination/target binding/Auth whitelist |
| 157 | USER DETAIL ADMIN UI | Mã + SQL/JS; I/U | [Admin detail](ADMIN_DETAIL_PAGES.md), pagination/target binding/Auth whitelist |
| 158 | FRONTEND COMPONENT STRUCTURE | Cấu trúc tương đương; U | shared AdminData, ActionDialog và components hiện có; không đổi folder chỉ để khớp ví dụ |
| 159 | DANGEROUS ACTION COMPONENT | Cấu trúc tương đương; U | shared AdminData, ActionDialog và components hiện có; không đổi folder chỉ để khớp ví dụ |
| 160 | DOMAIN RULE: UI KHÔNG QUYẾT ĐỊNH BUSINESS LOGIC | Mã + SQL/JS; I | Cloud gửi intent, server quyết định tiền/kho/nợ; demo local tách riêng theo yêu cầu |
| 161 | ERROR LAYERS | Mã + JS; I | [Lớp lỗi public](APPLICATION_ERRORS.md), ApplicationError, service/Edge/client boundaries |
| 162 | FILE MIGRATION STRATEGY | Đối chiếu/tài liệu | [Audit A-J](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A-Q](PLATFORM_IMPLEMENTATION_REPORT.md); đổi từng domain, bảo toàn FK/legacy |
| 163 | DEPENDENCY RULE | Đối chiếu/tài liệu | [Audit A-J](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A-Q](PLATFORM_IMPLEMENTATION_REPORT.md); đổi từng domain, bảo toàn FK/legacy |
| 164 | GỢI Ý ERD TỔNG QUAN | Đối chiếu/tài liệu | [Audit A-J](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A-Q](PLATFORM_IMPLEMENTATION_REPORT.md); đổi từng domain, bảo toàn FK/legacy |
| 165 | CODEX PHẢI REVIEW CẤU TRÚC TRƯỚC KHI IMPLEMENT | Đối chiếu/tài liệu | [Audit A-J](PLATFORM_ARCHITECTURE_AUDIT.md), [báo cáo A-Q](PLATFORM_IMPLEMENTATION_REPORT.md); đổi từng domain, bảo toàn FK/legacy |
