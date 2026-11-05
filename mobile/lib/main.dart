import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'app/app.dart';
import 'core/config/app_config.dart';
import 'core/network/api_client.dart';
import 'features/auth/data/auth_repository_impl.dart';
import 'features/auth/data/supabase_auth_repository.dart';
import 'features/auth/domain/auth_repository.dart';
import 'features/auth/presentation/auth_controller.dart';
import 'features/sales/data/mock_sales_repository.dart';
import 'features/sales/data/sales_repository_impl.dart';
import 'features/sales/domain/sales_repository.dart';
import 'features/stores/data/store_repository_impl.dart';
import 'features/stores/presentation/store_controller.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Đọc cấu hình từ môi trường biên dịch (--dart-define-from-file=env.json)
  final config = AppConfig.fromEnvironment();

  AuthRepository authRepository;
  SalesRepository salesRepository;

  if (config.isConfigured) {
    try {
      await Supabase.initialize(
        url: config.supabaseUrl,
        // ignore: deprecated_member_use
        anonKey: config.supabaseAnonKey,
      );
      final client = Supabase.instance.client;
      authRepository = SupabaseAuthRepository(supabaseClient: client);
      final clientApi = ApiClient(
        config: config,
        tokenProvider: authRepository.getAccessToken,
      );
      salesRepository = SalesRepositoryImpl(
        supabaseClient: client,
        apiClient: clientApi,
      );
    } catch (_) {
      authRepository = AuthRepositoryImpl();
      salesRepository = MockSalesRepository();
    }
  } else {
    authRepository = AuthRepositoryImpl();
    salesRepository = MockSalesRepository();
  }

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
      salesRepository: salesRepository,
      authController: authController,
      storeController: storeController,
    ),
  );
}
