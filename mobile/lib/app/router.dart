import 'package:flutter/material.dart';

import '../core/widgets/app_error_view.dart';
import '../core/widgets/config_missing_view.dart';
import '../features/auth/domain/auth_repository.dart';
import '../features/auth/domain/auth_state.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/splash_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/stores/presentation/store_controller.dart';
import '../features/stores/presentation/store_select_screen.dart';

/// Router điều hướng theo trạng thái phiên làm việc (State-driven App Router).
///
/// Áp dụng Router Guard chặt chẽ theo quy định Phần 2:
/// - Chưa cấu hình môi trường → `ConfigMissingView`.
/// - Đang kiểm tra phiên → `SplashScreen`.
/// - Chưa có phiên đăng nhập → `LoginScreen`.
/// - Có phiên nhưng chưa chọn cửa hàng → `StoreSelectScreen`.
/// - Có phiên và đã chọn cửa hàng hợp lệ → `HomeScreen`.
/// - Lỗi mạng / sự cố hệ thống → `AppErrorView` (kèm nút Thử lại, chống vòng lặp redirect).
class AppRouter extends StatelessWidget {
  final AuthController authController;
  final StoreController storeController;
  final AuthRepository authRepository;

  const AppRouter({
    super.key,
    required this.authController,
    required this.storeController,
    required this.authRepository,
  });

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: authController,
      builder: (context, _) {
        switch (authController.status) {
          case AuthStatus.unconfigured:
            return const ConfigMissingView();

          case AuthStatus.checking:
            return const SplashScreen();

          case AuthStatus.signedOut:
            return LoginScreen(authRepository: authRepository);

          case AuthStatus.signedInNeedsStore:
            return StoreSelectScreen(
              authController: authController,
              storeController: storeController,
            );

          case AuthStatus.ready:
            return HomeScreen(
              authController: authController,
              storeController: storeController,
            );

          case AuthStatus.error:
            return Scaffold(
              body: SafeArea(
                child: AppErrorView(
                  title: 'Lỗi phiên làm việc',
                  message: authController.error?.message ?? 'Không thể đồng bộ trạng thái đăng nhập. Vui lòng thử lại.',
                  onRetry: () => authController.retry(),
                ),
              ),
            );
        }
      },
    );
  }
}
