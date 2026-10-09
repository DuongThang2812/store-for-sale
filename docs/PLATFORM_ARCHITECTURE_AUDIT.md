# Tạp hóa BIN — current system audit & proposed architecture

> Giữ audit ban đầu để giải thích quyết định cấu trúc. Xem [CLOUD_IMPLEMENTATION_STATUS.md](./CLOUD_IMPLEMENTATION_STATUS.md) cho trạng thái sau triển khai Admin/status/MFA/cloud/legacy/kiểm kê/báo cáo. Chưa xác nhận hoàn tất mọi nghiệm thu production.

> [Báo cáo triển khai A–Q](PLATFORM_IMPLEMENTATION_REPORT.md) mô tả hiện trạng mới; [đối chiếu 165 mục](REQUIREMENTS_165_CROSSWALK.md) phân biệt evidence với nghiệm thu còn chờ.

Ngày đối chiếu: 2026-10-05. Phạm vi: grocery, fruit_shop và Platform Admin. Đây là bản thiết kế triển khai theo migration cộng thêm, không phải tuyên bố hệ thống đã hoàn thành.

## CURRENT SYSTEM AUDIT

1. **Auth:** Supabase Auth xử lý đăng ký, đăng nhập, refresh và logout. `AccountBootstrap` xác thực phiên với Auth trước khi mở cửa hàng. `profiles` có tên hiển thị; chưa có trạng thái `disabled`. Chưa có MFA Admin.
2. **Database:** PostgreSQL local có schema multi-shop, sản phẩm/đơn vị, khách, đơn bán, phiếu nhập, trả nợ, movements, categories, suppliers, batch scaffolding, giá vốn bình quân và kiểm kê. Các migration nằm trong `backend/supabase/migrations/`.
3. **Tables:** `stores`, `store_members`, `profiles`, `categories`, `products`, `product_units`, `customers`, `sales`, `sale_items`, `stock_receipts`, `stock_receipt_items`, `stock_movements`, `debt_payments`, `payment_allocations`, `audit_logs`, `suppliers`, `product_batches`, `inventory_counts`, `inventory_count_items`, các bảng định giá/nhập catalog. Chưa có `platform_admins`, `admin_audit_logs`, `security_events` hoặc bảng nợ riêng.
4. **RLS:** Các business tables bật RLS, policy SELECT theo membership; direct write tiền/kho/nợ bị thu hồi và RPC `SECURITY DEFINER` kiểm tra `auth.uid()`. Helper membership chưa xét thành viên/shop/tài khoản bị vô hiệu. Cost mới được chặn bằng column grant, còn giá nhập cũ vẫn có thể lộ qua catalog cho staff.
5. **localStorage:** `useShopStore` persist products, customers, entries, cart/debtCarts theo user/store. Các trang Sales, Stock, Debt, Revenue, Home, CSV, Account và lịch sử còn dùng state này. Lịch sử máy tính local là UI-only. Backup hiện chỉ xuất local state.
6. **Product model:** Một `products.stock_base` cho đơn vị nhỏ nhất; `product_units` chứa hệ số, giá nhập/bán và quyền nhập/bán. UI có `pricing` cho các nhóm. Hạt hiện base `lạng`; target gram cần migration riêng, không đổi âm thầm.
7. **Unit/conversion:** Grocery có thùng/bịch/gói/cây và giá từng đơn vị. Fruit có gram trong kho, kg nhập/bán với lượng `numeric(14,3)`. Client xem trước; RPC xác minh hệ số và tính thành tiền.
8. **Sale:** UI checkout còn local; DB `create_sale` đã atomically tạo sale/items, trừ stock, ghi movement, tăng nợ khi credit, chống duplicate bằng request ID. Sale item snapshot tên/quy cách/giá; migration mới bổ sung cost snapshot.
9. **Debt:** UI phân bổ local theo đơn cũ nhất và xóa khách khỏi sổ khi trả hết. DB giữ customer record, cập nhật `current_debt`/`outstanding_amount`, `payment_allocations` theo đơn cũ nhất; UI có thể ẩn khách hết nợ mà vẫn giữ lịch sử.
10. **Stock:** UI nhập/hao hụt local; DB `receive_stock`/`adjust_stock`/`record_inventory_count` ghi movement atomically. Giá vốn mới dùng weighted average; tồn cũ chưa rõ vốn giữ NULL cho đến khi owner định giá.
11. **Cancellation:** UI dùng `applySaleCancellation`; DB `cancel_sale` hoàn stock, giảm phần nợ chưa trả, ghi hoàn tiền phần đã trả và chống hủy hai lần qua status. UI chưa gọi RPC.
12. **Security risks:** Chưa có shop status/profile status/member active guard. Không có Admin backend/MFA. Purchase prices còn trong member-readable catalog. Service-role không có trong frontend env nhưng Admin Edge Function cần cấu hình server-only. Các trang local có thể lệch DB.
13. **Migration risks:** Local có đơn mẫu thiếu items, nợ mở đầu, khách đã trả hết bị xóa khỏi sổ, tồn hiện tại là snapshot; phát lại giao dịch cũ sẽ nhân đôi stock. Cần kiểm tra version/hash, backup, map ID, reconcile và marker chống nhập lại.
14. **Preserve:** UX hiện tại, grocery multi-unit/mixed-unit prices, fruit gram/kg, debt oldest-first, cancellation/refund, CSV, backup và history. Không reset/drop dữ liệu.

## PROPOSED ARCHITECTURE

**A. Tables:** Giữ bảng vật lý `stores` (`shops` trong sơ đồ), `store_members` (`shop_members`), `stock_receipts` (`stock_imports`) và `stock_movements` (`inventory_movements`) để bảo toàn FK/migration. Bổ sung `stores.status`, `store_members.is_active`, `profiles.account_status`, debt ledger nếu cần để phục hồi nợ cũ, `platform_admins`, `admin_audit_logs`, `security_events`, các bảng chuyển legacy.

**B. Relationships:** Mọi business row giữ `store_id` trực tiếp hoặc FK đến row có `store_id`. `platform_admins.user_id` tham chiếu Auth user nhưng không biến admin thành shop member. Audit admin tham chiếu actor và target, không tham chiếu/chứa customer PII mặc định.

**C. RPC:** Dùng các RPC hiện có cho sale, receipt, payment, cancellation, adjustment và count; thêm guard centralized cho active account/member/shop. Báo cáo shop dùng SQL aggregate owner-only. RPC chuyển legacy dùng transaction, checksum và marker. Admin mutations đi qua RPC có audit cùng transaction.

**D. Edge Functions:** Một lớp Admin API dùng JWT của người gọi, kiểm tra active platform admin và AAL2, validate input; chỉ server giữ secret/service-role. Action gọi RPC transaction có audit; read API phân trang và chỉ trả metadata cần thiết.

**E. Service layer:** Giữ `src/services`/`src/repositories` hiện có, mở rộng theo domain từng bước; thêm `src/admin/services`. React Page chỉ gọi service/repository, không tự gửi nhiều DB writes để hoàn thành một nghiệp vụ.

**F. Zustand:** `useAccountStore` làm auth/shop context, `useCartStore` làm giỏ tạm. `useShopStore` là compatibility layer cho legacy cho đến khi wizard chuyển xong; cloud state chỉ là cache tạm, không persist toàn bộ DB trong localStorage.

**G. Routes:** Shop routes hiện tại tiếp tục dưới `MainLayout`; `/admin/*` có guard và `AdminLayout` riêng, không trộn navigation.

**H. Admin pages:** Dashboard, Shops/List/Detail, Users/List/Detail, Admins, Security, Audit Logs, System, Settings và MFA setup/challenge. Mỗi trang có loading/error/empty/pagination; action nguy hiểm có lý do và xác nhận.

**I. Shop pages:** Sales, Stock/Import/CSV, Debt, History, Revenue, Home và Account cần chuyển sang service cloud; category/supplier/auth đang nối DB được giữ.

**J. Migration order:** Backup + audit → trạng thái account/member/shop và RLS → product/unit conversion → stock/sale/debt RPC → legacy import/reconciliation → cloud UI → owner reports → Admin tables/RPC/Edge → Admin UI → RLS/security tests → build/lint/test. Mỗi thay đổi schema là migration mới và chạy test trước bước tiếp theo.

### So với sơ đồ đề xuất

Tên vật lý hiện có khác (`stores`, `stock_receipts`, `stock_movements`) nhưng quan hệ tương đương. Giữ tên tránh rename/drop hàng loạt, giảm rủi ro dữ liệu và giữ RPC cũ; service/UI dùng thuật ngữ shop/import/inventory. `debts` riêng chưa có: hiện nợ theo `sales.outstanding_amount` + `payment_allocations`; khi chuyển nợ mở đầu cần mô hình ledger rõ để không giả hóa đơn có hàng. Hạt dùng lạng hiện tại; chuyển sang gram phải nhân hệ số/tồn/threshold và giữ snapshot giao dịch cũ nguyên vẹn.
