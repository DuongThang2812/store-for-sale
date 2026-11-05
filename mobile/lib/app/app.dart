import 'package:flutter/material.dart';

import '../core/config/app_config.dart';
import '../core/network/api_client.dart';
import '../features/auth/domain/auth_repository.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/inventory/domain/inventory_repository.dart';
import '../features/reports/domain/report_repository.dart';
import '../features/sales/domain/sales_repository.dart';
import '../features/stores/domain/store_repository.dart';
import '../features/stores/presentation/store_controller.dart';
import 'router.dart';
import 'theme.dart';

/// Ứng dụng chính Tạp hóa BIN Mobile.
class TapHoaBinApp extends StatelessWidget {
  final AppConfig config;
  final ApiClient apiClient;
  final AuthRepository authRepository;
  final StoreRepository storeRepository;
  final SalesRepository? salesRepository;
  final InventoryRepository? inventoryRepository;
  final ReportRepository? reportRepository;
  final AuthController authController;
  final StoreController storeController;

  const TapHoaBinApp({
    super.key,
    required this.config,
    required this.apiClient,
    required this.authRepository,
    required this.storeRepository,
    required this.authController,
    required this.storeController,
    this.salesRepository,
    this.inventoryRepository,
    this.reportRepository,
  });

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Tạp hóa BIN',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      home: AppRouter(
        authController: authController,
        storeController: storeController,
        authRepository: authRepository,
        salesRepository: salesRepository,
        inventoryRepository: inventoryRepository,
        reportRepository: reportRepository,
      ),
    );
  }
}
