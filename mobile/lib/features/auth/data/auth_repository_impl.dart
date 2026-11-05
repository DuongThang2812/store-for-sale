import 'dart:async';

import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';

/// Triển khai AuthRepository in-memory cho môi trường test và dev offline.
class AuthRepositoryImpl implements AuthRepository {
  final _controller = StreamController<AuthUser?>.broadcast();
  AuthUser? _currentUser;

  AuthRepositoryImpl({AuthUser? initialUser}) : _currentUser = initialUser;

  @override
  Stream<AuthUser?> get authStateChanges => _controller.stream;

  @override
  Future<AuthUser?> signInWithEmail(String email, String password) async {
    final user = AuthUser(
      id: 'mock-user-${email.hashCode}',
      email: email,
      displayName: email.split('@').first,
      accessToken: 'mock-token-${DateTime.now().millisecondsSinceEpoch}',
    );
    setSession(user);
    return user;
  }

  @override
  Future<AuthUser?> signUpWithEmail(
    String email,
    String password, {
    String? displayName,
  }) async {
    final user = AuthUser(
      id: 'mock-user-${email.hashCode}',
      email: email,
      displayName: displayName ?? email.split('@').first,
      accessToken: 'mock-token-${DateTime.now().millisecondsSinceEpoch}',
    );
    setSession(user);
    return user;
  }

  @override
  Future<void> signInWithGoogle() async {
    final user = AuthUser(
      id: 'google-user-001',
      email: 'google.user@example.com',
      displayName: 'Google User',
      accessToken: 'google-mock-token-${DateTime.now().millisecondsSinceEpoch}',
    );
    setSession(user);
  }

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
