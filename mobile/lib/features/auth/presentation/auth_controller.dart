import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../../core/config/app_config.dart';
import '../../../core/errors/app_error.dart';
import '../../stores/domain/store_models.dart';
import '../../stores/domain/store_repository.dart';
import '../domain/auth_repository.dart';
import '../domain/auth_state.dart';

/// Bộ quản lý trạng thái phiên làm việc (Session Controller).
///
/// Quản lý toàn bộ vòng đời phiên:
/// `checking` -> `unconfigured` / `signedOut` / `signedInNeedsStore` / `ready` / `error`.
/// Đảm bảo khi đăng xuất hoặc đổi tài khoản, toàn bộ dữ liệu cửa hàng trong bộ nhớ
/// đều được xóa sạch.
class AuthController extends ChangeNotifier {
  final AuthRepository authRepository;
  final StoreRepository storeRepository;
  final AppConfig config;

  StreamSubscription<AuthUser?>? _authSubscription;

  AuthStatus _status = AuthStatus.checking;
  AuthUser? _user;
  AppError? _error;

  AuthController({
    required this.authRepository,
    required this.storeRepository,
    required this.config,
  }) {
    _authSubscription = authRepository.authStateChanges.listen(
      _handleAuthChange,
    );
  }

  AuthStatus get status => _status;
  AuthUser? get user => _user;
  AppError? get error => _error;
  bool get isAuthenticated => _user != null;

  /// Khởi tạo và kiểm tra phiên khi ứng dụng mở
  Future<void> initialize() async {
    _error = null;

    if (!config.isConfigured) {
      _status = AuthStatus.unconfigured;
      notifyListeners();
      return;
    }

    _status = AuthStatus.checking;
    notifyListeners();

    try {
      final currentUser = await authRepository.getCurrentUser();
      _user = currentUser;

      if (currentUser == null) {
        _status = AuthStatus.signedOut;
        await storeRepository.clearActiveStore();
      } else {
        final activeStore = await storeRepository.getActiveStore();
        if (activeStore != null) {
          _status = AuthStatus.ready;
        } else {
          _status = AuthStatus.signedInNeedsStore;
        }
      }
    } catch (e) {
      _status = AuthStatus.error;
      _error = AppError.fromException(e);
    }

    notifyListeners();
  }

  /// Lắng nghe thay đổi phiên từ Repository
  Future<void> _handleAuthChange(AuthUser? newUser) async {
    final previousUser = _user;
    _user = newUser;

    // Nếu đổi sang tài khoản khác hoặc đăng xuất, xóa toàn bộ thông tin cửa hàng cũ trong RAM
    if (previousUser?.id != newUser?.id) {
      await storeRepository.clearActiveStore();
    }

    if (newUser == null) {
      _status = AuthStatus.signedOut;
    } else {
      final activeStore = await storeRepository.getActiveStore();
      if (activeStore != null) {
        _status = AuthStatus.ready;
      } else {
        _status = AuthStatus.signedInNeedsStore;
      }
    }

    notifyListeners();
  }

  /// Gọi khi người dùng chọn một cửa hàng
  Future<void> onStoreSelected(StoreDto store) async {
    await storeRepository.setActiveStore(store);
    _status = AuthStatus.ready;
    notifyListeners();
  }

  /// Đăng xuất khỏi hệ thống: xóa sạch token và thông tin cửa hàng
  Future<void> signOut() async {
    _status = AuthStatus.checking;
    notifyListeners();

    try {
      await authRepository.signOut();
      await storeRepository.clearActiveStore();
      _user = null;
      _error = null;
      _status = AuthStatus.signedOut;
    } catch (e) {
      _error = AppError.fromException(e);
      _status = AuthStatus.signedOut; // Vẫn đưa về signedOut để không bị kẹt
    }

    notifyListeners();
  }

  /// Thử lại khi gặp lỗi
  Future<void> retry() async {
    await initialize();
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }
}
