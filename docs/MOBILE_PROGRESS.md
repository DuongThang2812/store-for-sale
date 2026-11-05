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
| **Phần 5** | Nhập hàng, Kiểm kê/Hao hụt, Danh mục, Báo cáo lãi/lỗ | **ĐANG TRIỂN KHAI** | Restock, stock counting, supplier/category, management report RPC. |
| **Phần 6** | Bộ test toàn diện, Linter, Build APK, Release Readiness | **CHƯA BẮT ĐẦU** | Analyze, unit/widget tests, web/backend regression check, Android release config. |

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
