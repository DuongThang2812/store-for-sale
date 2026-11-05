import 'package:flutter/material.dart';

import 'app/app.dart';
import 'core/config/app_config.dart';
import 'core/network/api_client.dart';
import 'features/auth/data/auth_repository_impl.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/stores/data/store_repository_impl.dart';
import 'features/stores/presentation/store_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Đọc cấu hình từ môi trường biên dịch (--dart-define-from-file=env.json)
  final config = AppConfig.fromEnvironment();

  // Khởi tạo các lớp Repository và Network Client
  final authRepository = AuthRepositoryImpl();

  final apiClient = ApiClient(
    config: config,
    tokenProvider: authRepository.getAccessToken,
  );

  final storeRepository = StoreRepositoryImpl(apiClient: apiClient);

  // Khởi tạo các Controller quản lý trạng thái
  final authController = AuthController(
    authRepository: authRepository,
    storeRepository: storeRepository,
    config: config,
  );

  final storeController = StoreController(storeRepository: storeRepository);

  // Bắt đầu kiểm tra phiên ban đầu
  authController.initialize();

  runApp(
    TapHoaBinApp(
      config: config,
      apiClient: apiClient,
      authRepository: authRepository,
      storeRepository: storeRepository,
      authController: authController,
      storeController: storeController,
    ),
  );
}
