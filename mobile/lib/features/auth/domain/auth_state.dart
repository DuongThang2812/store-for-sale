/// Các trạng thái phiên làm việc của ứng dụng theo quy định Phần 2:
/// - `checking`: Đang kiểm tra phiên đăng nhập (Splash).
/// - `unconfigured`: Chưa thiết lập biến môi trường (ConfigMissing).
/// - `signedOut`: Chưa có phiên đăng nhập (Login).
/// - `signedInNeedsStore`: Đã đăng nhập nhưng chưa chọn cửa hàng (StoreSelect).
/// - `ready`: Đã đăng nhập và đã chọn cửa hàng hợp lệ (Home).
/// - `error`: Lỗi mạng hoặc lỗi hệ thống không thể tự khôi phục (ErrorView).
enum AuthStatus {
  checking,
  unconfigured,
  signedOut,
  signedInNeedsStore,
  ready,
  error,
}

/// Thông tin người dùng đã xác thực danh tính
class AuthUser {
  final String id;
  final String email;
  final String? displayName;
  final String? accessToken;

  const AuthUser({
    required this.id,
    required this.email,
    this.displayName,
    this.accessToken,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AuthUser &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          email == other.email &&
          accessToken == other.accessToken;

  @override
  int get hashCode =>
      id.hashCode ^ email.hashCode ^ (accessToken?.hashCode ?? 0);
}
