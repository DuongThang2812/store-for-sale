import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app/router.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/errors/app_error.dart';
import 'package:mobile/core/widgets/app_error_view.dart';
import 'package:mobile/core/widgets/config_missing_view.dart';
import 'package:mobile/features/auth/domain/auth_repository.dart';
import 'package:mobile/features/auth/domain/auth_state.dart';
import 'package:mobile/features/auth/presentation/auth_controller.dart';
import 'package:mobile/features/auth/presentation/login_screen.dart';
import 'package:mobile/features/auth/presentation/splash_screen.dart';
import 'package:mobile/features/home/presentation/home_screen.dart';
import 'package:mobile/features/stores/domain/store_models.dart';
import 'package:mobile/features/stores/domain/store_repository.dart';
import 'package:mobile/features/stores/presentation/store_controller.dart';
import 'package:mobile/features/stores/presentation/store_select_screen.dart';

class TestableAuthController extends AuthController {
  AuthStatus _forcedStatus;
  AppError? _forcedError;

  TestableAuthController({
    required super.authRepository,
    required super.storeRepository,
    required super.config,
    AuthStatus initialStatus = AuthStatus.checking,
    AppError? initialError,
  }) : _forcedStatus = initialStatus,
       _forcedError = initialError;

  @override
  AuthStatus get status => _forcedStatus;

  @override
  AppError? get error => _forcedError;

  void setForcedStatus(AuthStatus newStatus, {AppError? error}) {
    _forcedStatus = newStatus;
    _forcedError = error;
    notifyListeners();
  }
}

class SimpleAuthRepo implements AuthRepository {
  @override
  Stream<AuthUser?> get authStateChanges => const Stream.empty();
  @override
  Future<AuthUser?> getCurrentUser() async => null;
  @override
  Future<String?> getAccessToken() async => null;
  @override
  Future<AuthUser?> signInWithEmail(String email, String password) async =>
      null;
  @override
  Future<AuthUser?> signUpWithEmail(
    String email,
    String password, {
    String? displayName,
  }) async => null;
  @override
  Future<void> signInWithGoogle() async {}
  @override
  Future<void> signOut() async {}
  @override
  void dispose() {}
}

class SimpleStoreRepo implements StoreRepository {
  @override
  Future<List<StoreDto>> getStores() async => [];
  @override
  Future<String> createStore({
    required String name,
    required String businessType,
  }) async => 'new-store-1';
  @override
  Future<StoreDto?> getActiveStore() async => null;
  @override
  Future<void> setActiveStore(StoreDto store) async {}
  @override
  Future<void> clearActiveStore() async {}
}

void main() {
  const config = AppConfig(
    apiBaseUrl: 'https://api.tap-hoa-bin.vn',
    supabaseUrl: 'https://db.tap-hoa-bin.vn',
    supabaseAnonKey: 'anon_token_123',
  );

  Widget createWidgetUnderTest(
    AuthController authCtrl,
    StoreController storeCtrl,
    AuthRepository authRepo,
  ) {
    return MaterialApp(
      home: AppRouter(
        authController: authCtrl,
        storeController: storeCtrl,
        authRepository: authRepo,
      ),
    );
  }

  group('AppRouter Widget Tests & Guard Verification', () {
    late SimpleAuthRepo authRepo;
    late SimpleStoreRepo storeRepo;
    late StoreController storeCtrl;

    setUp(() {
      authRepo = SimpleAuthRepo();
      storeRepo = SimpleStoreRepo();
      storeCtrl = StoreController(storeRepository: storeRepo);
    });

    testWidgets('renders ConfigMissingView when status is unconfigured', (
      tester,
    ) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.unconfigured,
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(ConfigMissingView), findsOneWidget);
      expect(find.text('Chưa phát hiện cấu hình API'), findsOneWidget);
    });

    testWidgets('renders SplashScreen when status is checking', (tester) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.checking,
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(SplashScreen), findsOneWidget);
      expect(find.text('Đang kiểm tra phiên làm việc...'), findsOneWidget);
    });

    testWidgets('renders LoginScreen when status is signedOut', (tester) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.signedOut,
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(LoginScreen), findsOneWidget);
      expect(find.text('TẠP HÓA BIN'), findsOneWidget);
    });

    testWidgets('renders StoreSelectScreen when status is signedInNeedsStore', (
      tester,
    ) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.signedInNeedsStore,
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(StoreSelectScreen), findsOneWidget);
      expect(find.text('Chọn cửa hàng làm việc'), findsOneWidget);
    });

    testWidgets('renders HomeScreen when status is ready', (tester) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.ready,
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.text('Chức năng nghiệp vụ'), findsOneWidget);
    });

    testWidgets('renders AppErrorView when status is error', (tester) async {
      final authCtrl = TestableAuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: config,
        initialStatus: AuthStatus.error,
        initialError: const AppError(
          code: 'CONNECTION_FAILED',
          message: 'Không có kết nối mạng.',
        ),
      );

      await tester.pumpWidget(
        createWidgetUnderTest(authCtrl, storeCtrl, authRepo),
      );

      expect(find.byType(AppErrorView), findsOneWidget);
      expect(find.text('Không có kết nối mạng.'), findsOneWidget);
      expect(find.text('Thử lại'), findsOneWidget);
    });
  });
}
