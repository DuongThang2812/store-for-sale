import 'auth_state.dart';

/// Hợp đồng trừu tượng (abstract interface) cho Auth Repository.
/// Cho phép thay thế bằng Fake/Mock Auth Repository trong các bài kiểm thử tự động.
abstract class AuthRepository {
  /// Luồng sự kiện thay đổi trạng thái đăng nhập
  Stream<AuthUser?> get authStateChanges;

  /// Lấy thông tin phiên người dùng hiện tại
  Future<AuthUser?> getCurrentUser();

  /// Lấy access token hiện hành để đính kèm vào `Authorization: Bearer <token>`
  Future<String?> getAccessToken();

  /// Đăng xuất khỏi hệ thống
  Future<void> signOut();

  /// Đóng kết nối / giải phóng tài nguyên
  void dispose();
}
