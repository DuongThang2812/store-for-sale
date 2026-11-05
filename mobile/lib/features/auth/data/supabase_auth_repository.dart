import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthUser;

import '../../../core/errors/app_error.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';

/// Triển khai AuthRepository sử dụng Supabase Auth SDK.
///
/// Xử lý:
/// - Đăng ký & Đăng nhập Email/Mật khẩu.
/// - Đăng nhập Google OAuth qua Deep Link `app.taphoabin://login-callback`.
/// - Tự động duy trì và khôi phục phiên (Session Persistence) qua SharedPreferences.
/// - Xử lý trường hợp Google Provider chưa được kích hoạt trong Supabase Dashboard.
class SupabaseAuthRepository implements AuthRepository {
  final SupabaseClient _supabase;
  final _controller = StreamController<AuthUser?>.broadcast();
  StreamSubscription<AuthState>? _subscription;

  SupabaseAuthRepository({required SupabaseClient supabaseClient})
    : _supabase = supabaseClient {
    _subscription = _supabase.auth.onAuthStateChange.listen((data) {
      final user = data.session?.user;
      final token = data.session?.accessToken;
      if (user != null) {
        _controller.add(_mapUser(user, token));
      } else {
        _controller.add(null);
      }
    });
  }

  @override
  Stream<AuthUser?> get authStateChanges => _controller.stream;

  @override
  Future<AuthUser?> signInWithEmail(String email, String password) async {
    try {
      final res = await _supabase.auth.signInWithPassword(
        email: email.trim(),
        password: password,
      );
      final user = res.user;
      if (user == null) {
        throw const AppError(
          code: 'UNAUTHORIZED',
          message: 'Email hoặc mật khẩu không chính xác.',
        );
      }
      return _mapUser(user, res.session?.accessToken);
    } on AuthException catch (e) {
      throw AppError(
        code: 'UNAUTHORIZED',
        message: _mapAuthErrorMessage(e.message),
        details: e.statusCode,
      );
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<AuthUser?> signUpWithEmail(
    String email,
    String password, {
    String? displayName,
  }) async {
    try {
      final res = await _supabase.auth.signUp(
        email: email.trim(),
        password: password,
        data: displayName != null && displayName.isNotEmpty
            ? {'full_name': displayName.trim()}
            : null,
      );
      final user = res.user;
      if (user == null) {
        throw const AppError(
          code: 'VALIDATION_FAILED',
          message: 'Không thể tạo tài khoản. Vui lòng thử lại.',
        );
      }
      return _mapUser(user, res.session?.accessToken);
    } on AuthException catch (e) {
      throw AppError(
        code: 'VALIDATION_FAILED',
        message: _mapAuthErrorMessage(e.message),
        details: e.statusCode,
      );
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<void> signInWithGoogle() async {
    try {
      await _supabase.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: 'app.taphoabin://login-callback',
        authScreenLaunchMode: LaunchMode.externalApplication,
      );
    } on AuthException catch (e) {
      // Báo rõ blocker cấu hình nếu Google Provider chưa được bật trong Supabase
      throw AppError(
        code: 'GOOGLE_AUTH_UNAVAILABLE',
        message:
            'Đăng nhập Google chưa hoàn tất cấu hình trong Supabase: ${e.message}. '
            'Vui lòng sử dụng Đăng nhập bằng Email hoặc cấu hình Google OAuth trong Dashboard.',
      );
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<AuthUser?> getCurrentUser() async {
    final user = _supabase.auth.currentUser;
    final token = _supabase.auth.currentSession?.accessToken;
    if (user == null) return null;
    return _mapUser(user, token);
  }

  @override
  Future<String?> getAccessToken() async {
    return _supabase.auth.currentSession?.accessToken;
  }

  @override
  Future<void> signOut() async {
    try {
      await _supabase.auth.signOut();
    } catch (_) {
      // Vẫn broadcast signedOut kể cả khi rớt mạng
    }
    _controller.add(null);
  }

  AuthUser _mapUser(User user, String? token) {
    final metadata = user.userMetadata;
    final name =
        metadata?['full_name'] as String? ??
        metadata?['name'] as String? ??
        user.email?.split('@').first ??
        'Người dùng';

    return AuthUser(
      id: user.id,
      email: user.email ?? '',
      displayName: name,
      accessToken: token,
    );
  }

  static String _mapAuthErrorMessage(String msg) {
    final lower = msg.toLowerCase();
    if (lower.contains('invalid login credentials')) {
      return 'Email hoặc mật khẩu không chính xác.';
    }
    if (lower.contains('user already registered')) {
      return 'Email này đã được đăng ký tài khoản. Vui lòng đăng nhập.';
    }
    if (lower.contains('email not confirmed')) {
      return 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email để xác nhận.';
    }
    if (lower.contains('password should be at least')) {
      return 'Mật khẩu phải có tối thiểu 6 ký tự.';
    }
    if (lower.contains('network') || lower.contains('timeout')) {
      return 'Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra mạng.';
    }
    return msg;
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _controller.close();
  }
}
