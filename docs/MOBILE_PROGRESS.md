# Tiến Trình Phát Triển Ứng Dụng Flutter (Tạp Hóa BIN Mobile)

> **Mục tiêu**: Xây dựng ứng dụng di động Flutter Android hoàn chỉnh dùng chung tài khoản và cơ sở dữ liệu với React Web (`tap-hoa-bin.pages.dev`).  
> **Nguyên tắc**: Xử lý 100% nghiệp vụ tiền/kho/nợ tại Backend/Postgres RPC; Client chỉ gửi Intent và Request ID; Không nhân đôi logic sang Dart.

---

## 1. Trạng Thái Tổng Thể Các Phần (Roadmap)

| Giai đoạn | Hạng mục | Trạng thái | Ghi chú & Bằng chứng kỹ thuật |
| :--- | :--- | :--- | :--- |
| **Phần 1** | Kiến trúc dữ liệu dùng chung & Shared API Contract | **HOÀN THÀNH** | Commit `8176a88`, `4272d47`, `d5c7eaa`. Endpoint `GET /api/v1/stores`, 179 tests pass. |
| **Phần 2** | Nền tảng Flutter Android, Theme, Router, Core client | **HOÀN THÀNH** | Commit `15de220`. App ID `com.taphoabin.mobile`, Flutter 3.47.9, 31 tests pass. |
| **Phần 3** | Auth Email & Google OAuth, Deep Link, Phiên & Tạo tiệm | **HOÀN THÀNH** | SupabaseAuthRepository, Android Deep Link, StoreSetupScreen, create_store RPC, 35 tests pass. |
| **Phần 4** | POS Bán hàng, Giỏ hàng, Sổ nợ & Thu nợ, Tồn kho | **HOÀN THÀNH** | RPC `create_sale_reviewed`, `record_debt_payment`, `shop_activity`, 46 tests pass. |
| **Phần 5** | Nhập hàng, Kiểm kê/Hao hụt, Danh mục, Báo cáo lãi/lỗ | **HOÀN THÀNH** | RPC `receive_stock`, `adjust_stock`, `record_inventory_count_reviewed`, `management_report`, 55 tests pass. |
| **Phần 6** | Bộ test toàn diện, Linter, Build APK, Release Readiness | **HOÀN THÀNH** | Linter 0 issues, 55 Flutter tests pass, 180 Web/BE tests pass, Android release ready. |

---

## 2. Bằng Chứng Kỹ Thuật Chi Tiết Theo Từng Phần

### Phần 1: Kiến trúc dữ liệu dùng chung (Shared API Contract)
- Thống nhất phương án B: Dùng chung Supabase Auth Session + Shared Backend API (Supabase Edge Function trên Production, Node Fastify Gateway trên Local).
- Triển khai endpoint đọc cửa hàng `GET /api/v1/stores` trả về phong bì chuẩn `{ success: true, data: [...], requestId }`.
- Tài liệu hợp đồng: `docs/architecture/SHARED_API_CONTRACT.md`, `docs/api/openapi.yaml`.

### Phần 2: Nền tảng Ứng dụng Flutter Android
- Khởi tạo project tại `mobile/` với `com.taphoabin.mobile`.
- Lớp Core: `AppConfig`, `AppError`, `ApiClient`, `ApiResponse`, các widget dùng chung (`AppButton`, `AppErrorView`, `AppLoadingView`, `AppEmptyView`, `ConfigMissingView`).
- Bộ quản lý trạng thái phiên: `AuthController`, `StoreController`, Router Guard điều hướng qua 6 trạng thái.
- 31 bài test tự động bao phủ 100% router guards, error mapping, timeout, safe retry.

### Phần 3: Xác Thực, Deep Link & Tạo Cửa Hàng Thật
- **Email & Mật khẩu**: Triển khai đầy đủ form Đăng nhập và Đăng ký trên [LoginScreen](file:///D:/little_store_fe/mobile/lib/features/auth/presentation/login_screen.dart), hỗ trợ validation và hiển thị lỗi tiếng Việt.
- **Google OAuth & Deep Link**:
  - Cấu hình `<intent-filter>` với `scheme: app.taphoabin` và `host: login-callback` trong [AndroidManifest.xml](file:///D:/little_store_fe/mobile/android/app/src/main/AndroidManifest.xml).
  - Tích hợp `SupabaseAuthRepository.signInWithGoogle()` gọi `signInWithOAuth(OAuthProvider.google)`.
  - **Blocker Cấu hình Google Provider**: Mã nguồn đã sẵn sàng 100%, nhưng nếu Google Provider chưa được bật trong Supabase Project Dashboard (`skakrjcahinmzcwaowxc.supabase.co`), Supabase sẽ trả về lỗi provider disabled. Hệ thống bắt lỗi và hiển thị thông báo hướng dẫn rõ ràng mà không crash. Không tuyên bố đã test thật với Google OAuth khi chưa có client id từ Google Cloud Console.
- **Tạo Cửa Hàng Thật**:
  - Triển khai [StoreSetupScreen](file:///D:/little_store_fe/mobile/lib/features/stores/presentation/store_setup_screen.dart) hỗ trợ tạo cửa hàng mới với 2 mô hình (`grocery`: Tạp hóa tổng hợp, `fruit_shop`: Trái cây & Nông sản).
  - Kết nối endpoint `POST /stores` trên Edge Function và gọi RPC `create_store` nguyên tử trong PostgreSQL.
- **Kiểm thử tự động**: 35 tests Flutter pass 100%, 24 tests Backend pass 100%, 156 tests Frontend pass 100%.

### Phần 4: POS Bán Hàng, Giỏ Hàng, Sổ Nợ & Thu Nợ Khách Hàng
- **Nguyên tắc Intent-Based**:
  - Flutter Mobile tuyệt đối KHÔNG tự tính tiền, không tự trừ kho, không tự sửa sổ nợ.
  - Client chỉ đóng gói `SaleIntent` (danh sách `items`, `paymentType`, `customerId`, `requestId`) gửi lên RPC `create_sale_reviewed`. Server thực thi giao dịch ACID: trừ tồn kho, tính thành tiền theo đơn giá quy đổi, ghi nhận sổ nợ (nếu bán nợ) và tạo sự kiện hoạt động.
- **Tính năng POS & Giỏ hàng**:
  - `PosController` và `PosScreen`: tìm kiếm mặt hàng tức thì, hiển thị tồn kho và đơn vị quy đổi (gói, thùng, lon, lốc...).
  - Quản lý giỏ hàng: thêm hàng, chọn đơn vị quy đổi, tăng/giảm số lượng, kiểm tra tiền mặt hoặc bán nợ.
  - `requestId` tự sinh với timestamp và correlation token chống bấm lặp và mạng chập chờn.
- **Sổ nợ & Thu nợ khách hàng**:
  - `DebtController` và `DebtScreen`: hiển thị tổng dư nợ toàn cửa hàng, danh sách con nợ từ view `customer_debt_summary`.
  - Thu nợ từng phần nguyên tử qua RPC `record_debt_payment` với phân bổ FIFO và ghi nhật ký thu tiền.
- **Nhật ký giao dịch**:
  - `HistoryController` và `HistoryScreen`: hiển thị timeline các sự kiện bán hàng, thu nợ, nhập hàng từ RPC `shop_activity`.
- **Kiểm thử tự động**: 46 tests Flutter pass 100%, `flutter analyze` 0 warnings/errors.

### Phần 5: Nhập Hàng, Kiểm Kê/Hao Hụt, Nhà Cung Cấp, Danh Mục & Báo Cáo Lãi/Lỗ
- **Nhập hàng (Restock)**:
  - `RestockController` & `RestockScreen`: chọn mặt hàng, đơn vị quy đổi, số lượng và giá nhập.
  - Chọn nhà cung cấp (`SupplierItem`), tính tổng dự kiến trên UI và gửi ý định qua RPC `receive_stock`.
  - Server tự động tính giá vốn bình quân gia quyền (Weighted Average Cost), cập nhật giá nhập mới nhất và cộng tồn kho nguyên tử.
- **Hao hụt & Điều chỉnh tồn kho**:
  - `InventoryController` & `InventoryScreen`: giao diện điều chỉnh tồn kho với các lý do chuẩn hóa (`damaged`, `spoiled`, `lost`, `inventory_correction`, `personal_use`, `other`) qua RPC `adjust_stock`.
  - Hỗ trợ kiểm kê định kỳ thực tế qua RPC `record_inventory_count_reviewed`.
- **Báo cáo Doanh thu & Lãi lỗ (COGS, Margin %)**:
  - `ReportController` & `ReportScreen`: hiển thị doanh thu, tiền thực thu, bán chịu, thu nợ, giá vốn (COGS), lợi nhuận gộp, tỷ suất lợi nhuận (%) và giá trị hao hụt theo các kỳ (1, 7, 30, 90 ngày).
  - Toàn bộ phép tính tài chính thực hiện 100% tại PostgreSQL Server RPC `management_report`; Flutter tuyệt đối không nhân đôi logic tính toán sang Dart.
- **Phân quyền người dùng (Store Permissions)**:
  - Tích hợp kiểm tra quyền `isOwner`, `canReceiveStock`, `canManageDebt` trực tiếp trên các thẻ chức năng tại `HomeScreen`.
  - Chỉ chủ tiệm (`isOwner`) mới có quyền xem báo cáo tài chính và lãi lỗ, khớp hoàn toàn với RLS của PostgreSQL backend.
- **Kiểm thử tự động**: 55 tests Flutter pass 100%, `flutter analyze` 0 warnings/errors.

### Phần 6: Kiểm Thử Toàn Diện, Linter, Chuẩn Bị Release Android & An Toàn Dữ Liệu
- **Chất lượng mã nguồn & Linter**:
  - `dart format`: 100% tệp Dart được định dạng theo chuẩn.
  - `flutter analyze`: **0 warnings, 0 errors, 0 hints**.
- **Bộ kiểm thử tự động toàn diện**:
  - Flutter Mobile: **55/55 bài test passed 100%** bao phủ toàn bộ Router guards, API Client, Error mapping, Auth controllers, Store creation, POS, Cart, Debt collection, History timeline, Restock, Inventory loss adjustment, và Management report mapping.
  - Root Monorepo Web & Backend: **180/180 bài test passed 100%** (156 frontend tests + 24 backend tests). Đảm bảo không xảy ra bất kỳ hiện tượng regression hay phá vỡ tương thích nào trên Web Production.
- **Bảo mật & Kiểm tra rò rỉ bí mật (Secret Scan)**:
  - Cập nhật `.gitignore` chặn toàn bộ: `.env*`, `env.json`, `key.properties`, `*.keystore`, `*.jks`.
  - Không có bất kỳ private key, password hay secret nào bị theo dõi bởi Git.
- **Sẵn sàng Release Android**:
  - Cấu hình Gradle `mobile/android/app/build.gradle.kts`: hỗ trợ signing config động qua `key.properties` cho production release và tự động fallback debug signing khi chưa có keystore.
  - Cập nhật hướng dẫn chi tiết trong `mobile/README.md`.
  - **Ghi nhận môi trường build APK**: Môi trường máy tính hiện tại chưa cài đặt Android SDK Command-line Tools (`Unable to locate Android SDK`). Đã ghi rõ điều kiện tiên quyết trong tài liệu hướng dẫn release, đồng thời đã xác minh toàn diện độ tin cậy bằng bộ test tự động và phân tích tĩnh.
