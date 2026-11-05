import 'dart:async';

import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';

/// Triển khai AuthRepository cho môi trường di động.
///
/// Trong Phần 2, đóng vai trò quản lý phiên trong bộ nhớ và chuẩn bị kết nối
/// Supabase Auth ở Phần 3. Cho phép gán phiên để kiểm thử các luồng điều hướng.
class AuthRepositoryImpl implements AuthRepository {
  final _controller = StreamController<AuthUser?>.broadcast();
  AuthUser? _currentUser;

  AuthRepositoryImpl({AuthUser? initialUser}) : _currentUser = initialUser;

  @override
  Stream<AuthUser?> get authStateChanges => _controller.stream;

  @override
  Future<AuthUser?> getCurrentUser() async {
    return _currentUser;
  }

  @override
  Future<String?> getAccessToken() async {
    return _currentUser?.accessToken;
  }

  @override
  Future<void> signOut() async {
    _currentUser = null;
    _controller.add(null);
  }

  /// Hàm hỗ trợ cập nhật phiên cho việc kiểm thử và chạy thử nghiệm
  void setSession(AuthUser? user) {
    _currentUser = user;
    _controller.add(user);
  }

  @override
  void dispose() {
    _controller.close();
  }
}
