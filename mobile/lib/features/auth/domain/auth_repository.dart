import 'auth_state.dart';

/// Hợp đồng trừu tượng (abstract interface) cho Auth Repository.
/// Cho phép thay thế bằng Fake/Mock Auth Repository trong các bài kiểm thử tự động.
abstract class AuthRepository {
  /// Luồng sự kiện thay đổi trạng thái đăng nhập
  Stream<AuthUser?> get authStateChanges;

  /// Đăng nhập bằng Email và Mật khẩu
  Future<AuthUser?> signInWithEmail(String email, String password);

  /// Đăng ký tài khoản mới bằng Email và Mật khẩu
  Future<AuthUser?> signUpWithEmail(
    String email,
    String password, {
    String? displayName,
  });

  /// Đăng nhập bằng Google OAuth (hỗ trợ Deep Link callback trên Android)
  Future<void> signInWithGoogle();

  /// Lấy thông tin phiên người dùng hiện tại
  Future<AuthUser?> getCurrentUser();

  /// Lấy access token hiện hành để đính kèm vào `Authorization: Bearer <token>`
  Future<String?> getAccessToken();

  /// Đăng xuất khỏi hệ thống
  Future<void> signOut();

  /// Đóng kết nối / giải phóng tài nguyên
  void dispose();
}
