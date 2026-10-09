# Tạp hóa BIN — phần cloud đã triển khai và phần cần kiểm chứng

Cập nhật: 05/10/2026. Đây là trạng thái mã nguồn, không phải xác nhận đã triển khai production hoặc chuyển dữ liệu cửa hàng thật.

Xem [báo cáo triển khai A–Q](PLATFORM_IMPLEMENTATION_REPORT.md) và [nghiệm thu Supabase local](LOCAL_SUPABASE_ACCEPTANCE.md). Đã sao lưu, áp 33 migration trên local; Auth/PostgREST/Edge/MFA thật đã chạy đạt bằng fixture riêng.

[Bảng đối chiếu 165 mục](REQUIREMENTS_165_CROSSWALK.md) giữ số/tiêu đề yêu cầu, dẫn evidence và đánh dấu phần cần integration/UI QA; không phải chứng nhận 165/165 đạt.

## Kiến trúc

`React Page → useActiveShopStore / Service → Repository → Supabase Query / RPC → PostgreSQL + RLS`.

Admin dùng `React Admin Page → adminApi → admin-api Edge Function → RPC service-role → PostgreSQL`. JWT người gọi được xác thực và Admin phải có AAL2. Service-role chỉ nằm ở Edge, không nằm trong biến `VITE_*`.

Giữ tên bảng vật lý để bảo toàn FK và dữ liệu: `stores` = shops, `store_members` = shop_members, `stock_receipts/items` = stock_imports/items, `stock_movements` = inventory_movements. Nợ dùng `sales.outstanding_amount`, `customers.current_debt` và `payment_allocations`. Nợ mở đầu có `is_legacy_opening`, không tạo hàng bán giả. Không reset/rename/drop hàng loạt.

## Phase 3, 4, 9, 10, 11

| Phase | Đã có trong mã nguồn | Cần kiểm chứng tiếp |
| --- | --- | --- |
| 3 — nghiệp vụ DB | Hàng/kho/khách/bán/nhập/trả nợ/CSV/lịch sử/báo cáo đã nối cloud. Demo/legacy tách riêng. Auth/PostgREST local đạt. Wizard backup → preflight → import atomic → đối chiếu. | Wizard bằng bản dữ liệu thực đã sao lưu, production. |
| 4 — transaction | Tiền/kho/nợ atomic; chống ghi trùng; journal ID qua reload; hủy có server preview; bán/kiểm kê kiểm tra phiên bản; shop/role enforced ở DB. Retry/hủy/quyền qua API thật đạt. | Mất mạng sau commit trên trình duyệt. |
| 9 — vốn/lãi | Bình quân gia quyền; COGS snapshot từng dòng bán; hoàn vốn khi hủy; vốn không rõ giữ NULL; owner định giá tồn cũ một lần. | Đối chiếu số liệu thực. Không tái tạo giá vốn legacy thiếu thông tin. |
| 10 — kiểm kê | `/inventory/count`: nhiều hàng, lý do chênh lệch, phiên bản, movement. Hao hụt/dùng riêng và định giá tồn cũ trong chi tiết hàng. Kiểm kê phiên bản cũ/hao hụt gram qua API thật đạt. | Nghiệm thu thao tác nhiều thiết bị. |
| 11 — dashboard | Home đọc `shop_dashboard`, báo cáo/tỷ suất đọc `management_report`; tài chính owner-only, tồn/nhập gần đây, hư/thối theo đơn vị. Admin có System Health từ API. Auth/PostgREST/Edge local đạt. | Nghiệm thu trình duyệt và số liệu thực; xem `OWNER_DASHBOARD.md`. |

## File đảm nhiệm

| File | Trách nhiệm |
| --- | --- |
| `src/utils/productPricing.js`, `src/mappers/productMapper.js`, migration `...026` | Hạt mới tồn gram, nhập kg/bán kg hoặc lạng; giữ quy cách hàng cũ và CSV cũ; xem `SEED_WEIGHT_UNITS.md`. |
| `src/components/PricingFields.jsx`, `src/utils/stockCsv.js`, `src/mappers/productMapper.js` | Trái cây cân hoặc đếm/đóng gói, giá riêng kg/lạng/gram; danh mục riêng của grocery/fruit; xem `FRUIT_UNIT_VARIANTS.md`. |
| `src/components/PricingFields.jsx`, `src/utils/productPricing.js`, `src/mappers/productMapper.js` | Bánh kẹo nhiều cấp/giá riêng/roles và CSV; xem `SNACK_MULTI_UNITS.md`. |
| `src/lib/supabase.js` | Client public và kiểm tra cấu hình. |
| `src/services/serviceUtils.js`, `backend/supabase/functions/_shared/applicationErrors.js`, `src/admin/services/adminApi.js` | Lọc lỗi SQL/provider, mã lỗi app và thông báo tiếng Việt; xem `APPLICATION_ERRORS.md`. |
| `src/services/accountSession.js`, `storeService.js` | Phiên và cửa hàng/thành viên active; chọn demo/cloud đúng user/shop. |
| `src/repositories/demoShopRepository.js`, `supabaseShopRepository.js` | Tách demo và DB. |
| `src/stores/useCloudShopStore.js`, `useActiveShopStore.js` | Cache DB trong RAM, giỏ nháp và chọn dataMode. Không persist số dư/kho/nợ cloud. |
| `src/services/cloudCommandRunner.js`, `requestJournal.js` | ID qua retry; chặn response cũ sau đổi shop/logout. SessionStorage chỉ lưu hash intent và UUID. |
| `src/services/salesService.js`, `src/components/CloudSaleCancellationDialog.jsx` | RPC bán; preview hủy/tiền hoàn/giảm nợ do server quyết định. |
| `src/pages/InventoryCountPage.jsx`, `src/components/StockTools.jsx` | Kiểm kê, hao hụt, định giá tồn cũ. |
| `src/services/inventoryService.js` | Nhập/CSV/kiểm kê/điều chỉnh/đọc vốn owner-only. |
| `src/services/activityService.js`, `src/mappers/activityMapper.js`, `src/components/CloudActivityList.jsx` | Phân trang DB, lọc loại/khách/hàng, tải lịch sử cũ. |
| `src/pages/LegacyMigrationPage.jsx`, `src/services/legacyImportService.js` | Chuyển tồn/nợ mở đầu, archive nguyên lịch sử; giữ bản local. |
| `src/services/reportService.js`, `src/mappers/reportMapper.js`, `src/pages/home/OwnerDashboard.jsx`, `src/pages/RevenuePage.jsx` | Dashboard/report aggregate từ PostgreSQL; xem `OWNER_DASHBOARD.md`. |
| `src/pages/ShopSettingsPage.jsx`, `src/services/shopSettingsService.js`, `src/domain/shopPermissions.js` | Cài đặt, roster phân trang và cấp/thu hồi quyền nhân viên; DB kiểm tra lại quyền. |
| `backend/supabase/functions/admin-api/index.js`, `src/admin/` | Admin JWT/MFA/RPC và giao diện riêng. |
| `src/admin/pages/AdminListPages.jsx`, `backend/supabase/functions/admin-api/reads.js` | Bảng dùng chung, filter/sort/date/Admin và phân trang tại server; xem `ADMIN_LIST_FILTERS.md`. |
| `src/admin/pages/AdminDetailPages.jsx`, `backend/supabase/functions/admin-api/authSummary.js` | Tab shop, sections user và related pagination; whitelist thông tin xác thực; xem `ADMIN_DETAIL_PAGES.md`. |
| `backend/supabase/functions/admin-api/actions.js`, migration `...024` | Admission Admin tại DB trước mutation/Auth, hạn mức/retry, HTTP 429; xem `ADMIN_RATE_LIMITS.md`. |

Giữ JavaScript/JSX và SQL, không chuyển sang TypeScript.

## Migration mới nhất

Hiện có **33 migration**, đã áp lên Supabase local, mới nhất `202610050028_catalog_purchase_privacy.sql`:

- `...014`: token preview hủy, ID chống hủy trùng, cấm đổi đơn vị gốc của hàng có lịch sử kho.
- `...015`: lưu hàng idempotent, kiểm tra phiên bản để tránh ghi đè.
- `...016`: owner đọc vốn và kiểm kê có kiểm tra phiên bản.
- `...017`: lịch sử phân trang/lọc trên server.
- `...018`: bán có kiểm tra giá/tồn theo phiên bản; retry đã commit trả kết quả cũ.
- `...019`: lease/status gửi email reset Admin, chống gửi song song và giới hạn gửi lại.
- `...020`: cài đặt cửa hàng, quản lý nhân viên, quyền bán/nhập/nợ riêng, request ID/audit/phiên bản.
- `...021`: lọc lịch sử theo quyền công nợ tại server.
- `...022`: admission và khóa quyền trước mọi RPC ghi, kể cả retry request đã commit.
- `...023`: bộ lọc/sắp xếp/phân trang Admin, ngày/actor/action và metadata tối thiểu.
- `...024`: giới hạn Admin dùng chung tại PostgreSQL; retry giữ ID, cửa sổ trượt và fail closed trước mutation/Auth.
- `...025`: tab chi tiết shop, danh sách liên quan user phân trang/metadata tối thiểu; Auth summary sanitized ở Edge.
- `...026`: Hạt mới tồn gram, hệ số kg/lạng đúng; không chuyển tồn/lịch sử lạng cũ.
- `...027`: Dashboard chủ tiệm, tồn/nhập gần đây, hư/thối theo đơn vị; snapshot thống nhất và aggregate owner-only.
- `...028`: Che giá nhập cho nhân viên mặc định, chặn cột giá nhập Data API; quote cần quyền nhập, lịch sử chi phí phiếu nhập owner-only.

RPC cũ giữ cho tương thích; UI cloud dùng wrapper mới. Các bảng transaction khóa ghi trực tiếp từ browser.

## Kiểm tra đã chạy

- `npm test`: **141/141 JS tests đạt**, gồm dashboard/mapper/tỷ suất/phạm vi phiên, lớp lỗi app/không lộ SQL, retry sau commit, response sau logout, ID qua reload, CSV/fruit cân hoặc đếm/đóng gói/danh mục riêng/Hạt cân và lạng legacy, quyền/cài đặt, bộ lọc/admission/chi tiết Admin và Auth summary.
- `npm run build` đạt; `npm run lint` không còn cảnh báo; `git diff --check` không có lỗi whitespace.
- Supabase local: sao lưu full DB trước migration, áp đủ **33 migration** và **504/504 pgTAP assertions đạt** trong 20 file. Các test SQL rollback. Lần PostgreSQL tạm trước đó có 32 migration/487 assertions và đã dừng cluster.
- **43 kiểm tra HTTP Shop đạt** với Auth/PostgREST thật qua các service/repository của frontend: nhập/bán/nợ/hủy/kiểm kê/quyền/vốn/lãi/hao hụt. Admin Edge thực đạt 403/400/200/429, TOTP AAL2, ban/unban và retry. Xem `LOCAL_SUPABASE_ACCEPTANCE.md`.
- Hai kết nối đồng thời: duplicate sale chỉ ghi một lần; hai sale tranh tồn chỉ một đơn thắng; hai lần trả vượt tổng nợ chỉ một lần được nhận; thu hồi quyền chờ đơn staff đã admission commit rồi chặn đơn mới; hai Admin request tranh slot cuối chỉ một được nhận.
- Kiểm tra preview hủy khi trả nợ xen giữa; hoàn kho/nợ một lần; count phiên bản cũ bị chặn; COGS snapshot; lịch sử khách/hàng; staff không đọc vốn; tenant khác không đọc lịch sử; lease reset không gửi đôi.
- Kiểm tra local mới dùng Auth/PostgREST/Edge thật; chỉ lần isolated trước dùng mock `auth.uid()`.
- Docker/Supabase do người dùng chủ động mở. Không thiết lập tự bật stack; không reset dữ liệu. Sau cleanup vẫn 1 shop, 6 products, 0 sales, 1 Auth user.

## Chạy trên Supabase local khi bạn mở Docker

```powershell
Set-Location D:\little_store_fe
npm run db:start
npm run db:migrate
npm run db:test
npm run test:integration
npm test
npm run lint
npm run build
npm run dev
```

Không dùng `db:reset` mặc định. `db:migrate` áp thêm migration lên dữ liệu hiện có. Giữ `.env.local` đang dùng; frontend chỉ URL/public key.

Kiểm tra không cần Docker nếu có PostgreSQL 18:

```powershell
npm run db:test:isolated
```

Có thể đặt `PG_BIN`/`PG_VALIDATION_PORT`. Script tạo cluster tạm, stop sau test, chỉ xóa data của lần chạy và giữ log. Không có task tự khởi động lại.

## Giới hạn và việc chưa chốt

1. Không tuyên bố hoàn thành mọi mục trong hai tài liệu 165 phần. Quản lý nhân viên/settings đã có (`SHOP_STAFF_SETTINGS.md`); các bộ lọc/sắp xếp/phân trang Admin đã nối server (`ADMIN_LIST_FILTERS.md`). Chi tiết shop Admin/tabs và user sections đã có (`ADMIN_DETAIL_PAGES.md`); Hạt mới đã dùng kg/lạng/gram (`SEED_WEIGHT_UNITS.md`), giữ lạng legacy. Đơn vị quả/trái/hộp/khay/túi/thùng và giá kg/lạng/gram trái cây đã nối UI/mapper/CSV (`FRUIT_UNIT_VARIANTS.md`); danh mục tự tạo dùng cho cả grocery/fruit. `product_batches` được tài liệu yêu cầu mục 136 ghi rõ **Optional/Future**; hiện chỉ có nền tảng schema, chưa triển khai luồng batch.
2. Auth ban/unban và DB không chung transaction. DB/RLS là nguồn quyền thật; cần đối chiếu Auth khi lỗi mạng hoặc hai Admin đổi trạng thái đối nghịch. Xem `ADMIN_BOOTSTRAP.md`.
3. Crash sau gửi email nhưng trước đánh dấu sent có thể gửi thêm sau lease; không hứa exactly-once cho hiệu ứng ngoài DB.
4. JSON local không phải full DB backup. Production cần chính sách DB backup và diễn tập restore. Không nhận JSON local để ghi đè cloud DB.
5. Legacy giữ nguyên archive, không chế chi tiết/giá vốn thiếu. Tồn/nợ mở đầu phải đối chiếu trước dùng thực tế.
6. History dùng offset; giao dịch mới giữa các lần tải có thể cần reload đầu danh sách, UI gộp ID tránh trùng. Phiếu nhập cũ hiển thị tên hàng hiện tại, chưa có snapshot tên lúc nhập.
7. Admin có giới hạn thao tác dùng chung tại DB (`ADMIN_RATE_LIMITS.md`), reset còn giữ lease/hạn mức theo người nhận. HTTP 429/Auth/Edge local đã đạt; đây không phải giới hạn IP/login public hay giải pháp DDoS.
8. Mục 11/17/19/20/21: bánh kẹo đã nối form/mapper/CSV và giỏ nhiều cấp thùng/bịch/gói/cái/viên, giá riêng và dùng chung tồn (`SNACK_MULTI_UNITS.md`). Giữ file mẫu, quy cách và lịch sử cũ; không cần migration mới. HTTP/RPC trên Supabase đang dùng vẫn cần kiểm chứng.
9. Yêu cầu 161 đã có hợp đồng lỗi dùng chung (`APPLICATION_ERRORS.md`), lọc SQL/provider và thông báo tiếng Việt. DB giữ SQLSTATE hiện có; chưa chuyển mọi RPC sang mã nghiệp vụ PostgreSQL riêng. Edge local đã hoạt động; production chưa deploy.
