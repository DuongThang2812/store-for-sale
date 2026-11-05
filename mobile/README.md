# Tạp Hóa BIN - Ứng Dụng Di Động Android (Flutter)

Nền tảng ứng dụng di động cho hệ sinh thái **Tạp hóa BIN** (`tap-hoa-bin.pages.dev`), xây dựng bằng Flutter/Dart, dùng chung 100% cơ sở dữ liệu PostgreSQL, Auth Session và API Contract với phiên bản React Web.

---

## 1. Thông Tin Nền Tảng & Môi Trường

- **Application ID / Package Name**: `com.taphoabin.mobile`
- **Flutter SDK**: 3.47.9 (channel stable)
- **Dart SDK**: 3.13.7
- **Hệ điều hành mục tiêu**: Android (minSdk 21, targetSdk 34+)
- **Deep Link URL Scheme**: `app.taphoabin://login-callback` (dùng cho Google OAuth & Magic Link callback)

---

## 2. Kiến Trúc & Cấu Trúc Thư Mục

Ứng dụng tuân thủ kiến trúc phân tầng sạch (Clean Architecture kết hợp Feature-driven):

```
mobile/
├── lib/
│   ├── main.dart                       # Điểm khởi chạy ứng dụng & Dependency Injection
│   ├── app/
│   │   ├── app.dart                    # MaterialApp & Root Widget
│   │   ├── router.dart                 # State-driven Router Guard (kiểm soát chuyển màn hình)
│   │   └── theme.dart                  # Bảng màu Tạp hóa BIN (Emerald green, Slate, Material 3)
│   ├── core/
│   │   ├── config/app_config.dart      # Đọc cấu hình build-time & ánh xạ host 10.0.2.2 cho Android Emulator
│   │   ├── errors/app_error.dart       # Lớp lỗi chuẩn hóa đồng bộ với Backend API
│   │   ├── network/
│   │   │   ├── api_client.dart         # HTTP Client với Bearer Token, Correlation ID, timeout, Safe Retry
│   │   │   └── api_response.dart       # Phong bì phản hồi chuẩn {success, data, error, requestId}
│   │   └── widgets/                    # Các thành phần giao diện tái sử dụng (Button, Loading, Error, Empty)
│   └── features/
│       ├── auth/                       # Xác thực Email & Google OAuth (Phần 3)
│       │   ├── domain/                 # AuthState, AuthUser, AuthRepository interface
│       │   ├── data/                   # SupabaseAuthRepository & AuthRepositoryImpl (Mock)
│       │   └── presentation/           # AuthController, LoginScreen (Đăng nhập / Đăng ký)
│       ├── stores/                     # Chọn & Tạo Cửa hàng thật (Phần 3)
│       │   ├── domain/                 # StoreDto, StorePermissions, StoreRepository interface
│       │   ├── data/                   # StoreRepositoryImpl (gọi GET /api/v1/stores và POST /stores)
│       │   └── presentation/           # StoreController, StoreSelectScreen, StoreSetupScreen
│       ├── home/                       # Màn hình Trang chủ trung tâm (Phần 2, 4, 5)
│       │   └── presentation/           # HomeScreen (kiểm tra phân quyền isOwner, canReceiveStock)
│       ├── sales/                      # POS Bán hàng & Giỏ hàng (Phần 4)
│       │   ├── domain/                 # ProductItem, UnitVariant, CartItem, SaleIntent, SaleResult
│       │   ├── data/                   # SalesRepositoryImpl & MockSalesRepository
│       │   └── presentation/           # PosController, PosScreen
│       ├── debt/                       # Sổ nợ & Thu nợ khách hàng (Phần 4)
│       │   └── presentation/           # DebtController, DebtScreen
│       ├── history/                    # Nhật ký hoạt động & Lịch sử giao dịch (Phần 4)
│       │   └── presentation/           # HistoryController, HistoryScreen
│       ├── inventory/                  # Nhập hàng, Kiểm kê & Hao hụt (Phần 5)
│       │   ├── domain/                 # InventoryModels & InventoryRepository interface
│       │   ├── data/                   # InventoryRepositoryImpl & MockInventoryRepository
│       │   └── presentation/           # InventoryController, InventoryScreen, RestockController, RestockScreen
│       └── reports/                    # Báo cáo Doanh thu & Lãi lỗ (Phần 5)
│           ├── domain/                 # ManagementReport, ReportTotals, TopProductReport
│           ├── data/                   # ReportRepositoryImpl & MockReportRepository
│           └── presentation/           # ReportController, ReportScreen
└── test/                               # Bộ kiểm thử tự động toàn diện (55 unit & widget tests pass 100%)
```

---

## 3. Các Nguyên Tắc An Toàn Nghiệp Vụ Cốt Lõi

1. **Client Gửi Ý Định (Intent-Based), Server Tính Toán**:
   - Flutter Mobile tuyệt đối **KHÔNG tự ý cộng trừ tiền, không tự trừ tồn kho, không tự tính giá vốn (COGS) hay ghi nợ**.
   - Mọi nghiệp vụ cốt lõi đều đóng gói thành Intent kèm `requestId` gửi lên PostgreSQL RPCs (`create_sale_reviewed`, `record_debt_payment`, `receive_stock`, `adjust_stock`, `record_inventory_count_reviewed`).
   - Báo cáo tài chính, doanh thu, lợi nhuận gộp đọc trực tiếp từ server RPC `management_report`.
2. **Chống Bấm Lặp & Mạng Chập Chờn**:
   - Mọi thao tác ghi tiền hoặc kho đều tự sinh `requestId` duy nhất theo chuẩn UUID/Correlation ID. Server xử lý idempotent, ngăn ngừa tạo trùng đơn hàng hoặc trừ kho hai lần.
3. **Phân Quyền RLS & UI**:
   - Chỉ chủ cửa hàng (`isOwner`) mới có quyền truy cập màn hình Báo cáo Doanh thu & Lợi nhuận.
   - Nhân viên chỉ được nhập kho hoặc kiểm kê khi có cờ `canReceiveStock`.
4. **Không Rò Rỉ Bí Mật (Zero Secret Leaks)**:
   - File cấu hình chứa key thật `env.json` và `key.properties` được loại trừ trong `.gitignore`.

---

## 4. Hướng Dẫn Cấu Hình & Chạy Kiểm Thử

### Bước 1: Chuẩn bị file cấu hình môi trường
Sao chép file mẫu `env.sample.json` thành `env.json`:

```bash
cd mobile
copy env.sample.json env.json
```

Cập nhật `env.json` với Supabase URL và Supabase Publishable Anon Key của dự án:
```json
{
  "API_BASE_URL": "https://skakrjcahinmzcwaowxc.supabase.co/functions/v1/store-api",
  "SUPABASE_URL": "https://skakrjcahinmzcwaowxc.supabase.co",
  "SUPABASE_ANON_KEY": "<SUPABASE_ANON_KEY>",
  "DEV_EMULATOR_GATEWAY_URL": "http://10.0.2.2:8080/api/v1"
}
```

### Bước 2: Kiểm tra định dạng code & phân tích tĩnh (Linter)
```bash
# Kiểm tra định dạng Dart chuẩn hóa
dart format --output=none --set-exit-if-changed lib test

# Phân tích tĩnh cú pháp (yêu cầu 0 issues)
flutter analyze
```

### Bước 3: Chạy toàn bộ bộ kiểm thử tự động
```bash
# Chạy toàn bộ 55 bài test unit & widget
flutter test
```

### Bước 4: Chạy ứng dụng trên Emulator hoặc thiết bị thật
```bash
flutter run --dart-define-from-file=env.json
```

---

## 5. Chuẩn Bị Đóng Gói Release APK (Android)

### Cấu hình Ký Ứng Dụng (Release Keystore Signing):
Tạo file `mobile/android/key.properties` với thông tin chứng chỉ ký số:
```properties
storePassword=<mat_khau_keystore>
keyPassword=<mat_khau_key>
keyAlias=<ten_alias>
storeFile=../upload-keystore.jks
```

Hệ thống Gradle `mobile/android/app/build.gradle.kts` đã cấu hình sẵn:
- Nếu có file `key.properties`, bản build release sẽ tự động ký bằng chứng chỉ release.
- Nếu không có file `key.properties`, bản build sẽ sử dụng debug signing config để đảm bảo lập trình viên và CI vẫn build kiểm tra được mà không gặp lỗi.

### Lệnh đóng gói Release APK:
```bash
flutter build apk --release --dart-define-from-file=env.json
```

> **Lưu ý về Môi trường Biên Dịch**: Để biên dịch ra file APK thật (`.apk`), máy tính cần cài đặt **Android SDK Command-line Tools / Android Studio** và biến môi trường `ANDROID_HOME` hợp lệ. Nếu môi trường chưa cài đặt Android SDK, hãy chạy bộ test tự động (`flutter test`) để xác minh 100% logic ứng dụng.
