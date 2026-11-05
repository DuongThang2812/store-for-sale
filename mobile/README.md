# Tạp Hóa BIN - Ứng Dụng Di Động Android (Flutter)

Nền tảng ứng dụng di động cho hệ thống **Tạp hóa BIN** (`tap-hoa-bin.pages.dev`), xây dựng bằng Flutter/Dart, thiết kế dùng chung cơ sở dữ liệu và tài khoản với phiên bản React Web.

---

## 1. Thông Tin Nền Tảng

- **Application ID / Package Name**: `com.taphoabin.mobile`
- **Flutter SDK**: 3.47.9 (kênh stable)
- **Dart SDK**: 3.13.7
- **Hệ điều hành ưu tiên**: Android (Target API 34+)

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
│       ├── auth/                       # Phân hệ Xác thực & Quản lý phiên làm việc
│       │   ├── domain/                 # AuthState, AuthUser, AuthRepository interface
│       │   ├── data/                   # AuthRepositoryImpl
│       │   └── presentation/           # AuthController, SplashScreen, LoginScreen (khung Phần 2)
│       ├── stores/                     # Phân hệ Quản lý & Chọn cửa hàng
│       │   ├── domain/                 # StoreDto, StorePermissions, StoreRepository interface
│       │   ├── data/                   # StoreRepositoryImpl (gọi GET /api/v1/stores từ Phần 1)
│       │   └── presentation/           # StoreController, StoreSelectScreen
│       └── home/                       # Phân hệ Trang chủ bán hàng
│           └── presentation/           # HomeScreen (hiển thị tên tiệm thật, không số liệu giả)
└── test/                               # Bộ kiểm thử tự động toàn diện (31 unit & widget tests)
```

### Nguyên tắc cốt lõi:
1. **Giao diện không gọi HTTP trực tiếp**: Widget chỉ tương tác với Controller. Controller gọi Repository. Repository giao tiếp qua `ApiClient`.
2. **Abstract Repository**: Mọi repository đều có abstract class để có thể thay thế bằng Mock/Fake trong các bài kiểm thử tự động mà không cần mạng.
3. **Bảo vệ tài chính & kho hàng**: `ApiClient` chỉ tự động retry 1 lần đối với yêu cầu đọc an toàn (`GET`). **Tuyệt đối không tự động retry** các lệnh ghi (`POST`/`PUT`/`DELETE`) tiền, trừ kho hay cộng nợ.
4. **Không lưu trữ bí mật**: Không commit private key, service role key hay Google Client Secret vào source code.

---

## 3. Hướng Dẫn Cấu Hình & Chạy Ứng Dụng

### Bước 1: Chuẩn bị file cấu hình môi trường
Sao chép file mẫu `env.sample.json` thành `env.json` (file này đã được thêm vào `.gitignore` để chống lộ secret):

```bash
cd mobile
cp env.sample.json env.json
```

Chỉnh sửa nội dung `mobile/env.json`:
```json
{
  "API_BASE_URL": "https://skakrjcahinmzcwaowxc.supabase.co/functions/v1/store-api",
  "SUPABASE_URL": "https://skakrjcahinmzcwaowxc.supabase.co",
  "SUPABASE_ANON_KEY": "your_supabase_publishable_anon_key_here",
  "DEV_EMULATOR_GATEWAY_URL": "http://10.0.2.2:8080/api/v1"
}
```

> **Lưu ý với Android Emulator**: Khi chạy máy chủ Gateway cục bộ tại máy tính Windows (`localhost:8080`), ứng dụng sẽ tự động chuyển đổi thành `10.0.2.2:8080` để Emulator truy cập được máy host mà không cần cấu hình thủ công.

### Bước 2: Cài đặt thư viện dependencies
```bash
flutter pub get
```

### Bước 3: Kiểm tra quy chuẩn & chạy kiểm thử
```bash
# Kiểm tra định dạng code
dart format --output=none --set-exit-if-changed .

# Phân tích tĩnh cú pháp
flutter analyze

# Chạy toàn bộ 31 bài test tự động
flutter test
```

### Bước 4: Khởi chạy ứng dụng
```bash
# Chạy với file cấu hình môi trường
flutter run --dart-define-from-file=env.json
```

Nếu chạy mà không truyền file cấu hình, ứng dụng sẽ hiển thị màn hình **"Chưa phát hiện cấu hình API"** (`ConfigMissingView`) với hướng dẫn chi tiết từng bước mà không bị crash.

---

## 4. Các Trạng Thái Phiên & Điều Hướng (Router Guards)

Router hoạt động theo cơ chế State-driven chuẩn hóa:

| Trạng thái (`AuthStatus`) | Màn hình hiển thị | Router Guard & Hành vi |
| :--- | :--- | :--- |
| `unconfigured` | `ConfigMissingView` | Thiếu file cấu hình hoặc key chưa hợp lệ. |
| `checking` | `SplashScreen` | Đang kiểm tra token / phiên đăng nhập ban đầu. |
| `signedOut` | `LoginScreen` | Chưa đăng nhập; hiển thị form khung (đăng nhập thật ở Phần 3). |
| `signedInNeedsStore` | `StoreSelectScreen` | Đã có phiên đăng nhập, nạp danh sách cửa hàng thật từ Backend. |
| `ready` | `HomeScreen` | Đã chọn cửa hàng hợp lệ; hiển thị tên tiệm và danh mục nghiệp vụ. |
| `error` | `AppErrorView` | Lỗi mạng hoặc sự cố; có nút Thử lại, không bị vòng lặp redirect. |

> **Nguyên tắc an toàn dữ liệu**: Khi đăng xuất hoặc chuyển đổi tài khoản, toàn bộ thông tin cửa hàng đang giữ trong bộ nhớ (`_activeStore`) sẽ lập tức bị xóa sạch để tránh rò rỉ dữ liệu giữa các phiên người dùng.
