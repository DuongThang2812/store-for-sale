import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/router.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/widgets/app_button.dart';
import 'package:mobile/features/auth/data/auth_repository_impl.dart';
import 'package:mobile/features/auth/domain/auth_state.dart';
import 'package:mobile/features/auth/presentation/auth_controller.dart';
import 'package:mobile/features/auth/presentation/login_screen.dart';
import 'package:mobile/features/debt/presentation/debt_screen.dart';
import 'package:mobile/features/history/presentation/history_screen.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';
import 'package:mobile/features/inventory/presentation/inventory_screen.dart';
import 'package:mobile/features/inventory/presentation/restock_screen.dart';
import 'package:mobile/features/reports/presentation/report_screen.dart';
import 'package:mobile/features/sales/presentation/pos_screen.dart';
import 'package:mobile/features/stores/domain/store_models.dart';
import 'package:mobile/features/stores/domain/store_repository.dart';
import 'package:mobile/features/stores/presentation/store_controller.dart';
import 'package:mobile/features/stores/presentation/store_select_screen.dart';
import 'package:mobile/features/stores/presentation/store_setup_screen.dart';

class JourneyStoreRepository implements StoreRepository {
  final stores = <StoreDto>[];
  StoreDto? activeStore;

  @override
  Future<List<StoreDto>> getStores() async => stores;

  @override
  Future<String> createStore({
    required String name,
    required String businessType,
  }) async {
    const id = 'test-store';
    stores.add(
      StoreDto(
        id: id,
        name: name,
        slug: 'test-store',
        role: 'owner',
        storeType: businessType,
        currency: 'VND',
        timezone: 'Asia/Ho_Chi_Minh',
        permissions: const StorePermissions(
          canSell: true,
          canManageInventory: true,
          canViewReports: true,
          canManageStaff: true,
        ),
      ),
    );
    return id;
  }

  @override
  Future<StoreDto?> getActiveStore() async => activeStore;

  @override
  Future<void> setActiveStore(StoreDto store) async => activeStore = store;

  @override
  Future<void> clearActiveStore() async => activeStore = null;
}

void main() {
  testWidgets('login, create store, reach home, and sign out', (tester) async {
    const config = AppConfig(
      apiBaseUrl: 'https://example.test/api',
      supabaseUrl: 'https://example.test',
      supabaseAnonKey: 'test-public-key',
    );
    final authRepository = AuthRepositoryImpl();
    final storeRepository = JourneyStoreRepository();
    final authController = AuthController(
      authRepository: authRepository,
      storeRepository: storeRepository,
      config: config,
    );
    final storeController = StoreController(storeRepository: storeRepository);
    await authController.initialize();

    await tester.pumpWidget(
      MaterialApp(
        home: AppRouter(
          authController: authController,
          storeController: storeController,
          authRepository: authRepository,
        ),
      ),
    );
    expect(find.byType(LoginScreen), findsOneWidget);

    await tester.tap(find.widgetWithText(AppButton, 'Đăng nhập'));
    await tester.pump();
    expect(find.text('Vui lòng nhập địa chỉ email.'), findsOneWidget);
    expect(find.text('Vui lòng nhập mật khẩu.'), findsOneWidget);

    await tester.enterText(
      find.widgetWithText(TextFormField, 'ten@example.com'),
      'owner@example.test',
    );
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Tối thiểu 6 ký tự'),
      'password123',
    );
    await tester.tap(find.widgetWithText(AppButton, 'Đăng nhập'));
    await tester.pumpAndSettle();
    expect(find.byType(StoreSelectScreen), findsOneWidget);

    await tester.tap(find.widgetWithText(AppButton, 'Tạo cửa hàng mới'));
    await tester.pumpAndSettle();
    expect(find.byType(StoreSetupScreen), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, 'Tiệm thử nghiệm');
    await tester.ensureVisible(
      find.widgetWithText(AppButton, 'Tạo cửa hàng & Bắt đầu'),
    );
    await tester.tap(find.widgetWithText(AppButton, 'Tạo cửa hàng & Bắt đầu'));
    await tester.pumpAndSettle();
    expect(authController.status, AuthStatus.ready);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.byType(StoreSetupScreen), findsNothing);

    for (final route in <(String, Type)>[
      ('Bán hàng (POS)', PosScreen),
      ('Sổ nợ khách hàng', DebtScreen),
      ('Nhập hàng từ nhà cung cấp', RestockScreen),
      ('Kiểm kho & Hao hụt', InventoryScreen),
      ('Báo cáo doanh thu & Lãi lỗ', ReportScreen),
    ]) {
      await tester.ensureVisible(find.text(route.$1));
      await tester.tap(find.text(route.$1));
      await tester.pumpAndSettle();
      expect(find.byType(route.$2), findsOneWidget, reason: route.$1);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsOneWidget);
    }

    await tester.tap(find.byTooltip('Nhật ký giao dịch'));
    await tester.pumpAndSettle();
    expect(find.byType(HistoryScreen), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Đăng xuất'));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(storeRepository.activeStore, isNull);
  });

  testWidgets('staff sees only allowed store operations', (tester) async {
    const staffStore = StoreDto(
      id: 'staff-store',
      name: 'Tiệm nhân viên',
      slug: 'staff-store',
      role: 'staff',
      storeType: 'grocery',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
      permissions: StorePermissions(
        canSell: false,
        canManageInventory: true,
        canViewReports: false,
        canManageStaff: false,
      ),
    );
    final authRepository = AuthRepositoryImpl(
      initialUser: const AuthUser(
        id: 'staff',
        email: 'staff@example.test',
        accessToken: 'test-token',
      ),
    );
    final storeRepository = JourneyStoreRepository()..activeStore = staffStore;
    final storeController = StoreController(storeRepository: storeRepository);
    await storeController.selectStore(staffStore);
    final authController = AuthController(
      authRepository: authRepository,
      storeRepository: storeRepository,
      config: const AppConfig(
        apiBaseUrl: 'https://example.test/api',
        supabaseUrl: 'https://example.test',
        supabaseAnonKey: 'test-public-key',
      ),
    );
    await authController.initialize();
    await tester.pumpWidget(MaterialApp(
      home: AppRouter(
        authController: authController,
        storeController: storeController,
        authRepository: authRepository,
      ),
    ));
    expect(find.byType(HomeScreen), findsOneWidget);

    await tester.ensureVisible(find.text('Bán hàng (POS)'));
    await tester.tap(find.text('Bán hàng (POS)'));
    await tester.pump();
    expect(find.byType(PosScreen), findsNothing);
    expect(find.text('Bạn không có quyền bán hàng.'), findsOneWidget);

    await tester.ensureVisible(find.text('Kiểm kho & Hao hụt'));
    await tester.tap(find.text('Kiểm kho & Hao hụt'));
    await tester.pumpAndSettle();
    expect(find.byType(InventoryScreen), findsOneWidget);
    expect(find.text('Kiểm kê định kỳ'), findsNothing);
  });
}
