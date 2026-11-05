import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/features/auth/domain/auth_repository.dart';
import 'package:mobile/features/auth/domain/auth_state.dart';
import 'package:mobile/features/auth/presentation/auth_controller.dart';
import 'package:mobile/features/stores/domain/store_models.dart';
import 'package:mobile/features/stores/domain/store_repository.dart';

class FakeAuthRepository implements AuthRepository {
  final _controller = StreamController<AuthUser?>.broadcast();
  AuthUser? user;

  FakeAuthRepository({this.user});

  @override
  Stream<AuthUser?> get authStateChanges => _controller.stream;

  @override
  Future<AuthUser?> getCurrentUser() async => user;

  @override
  Future<String?> getAccessToken() async => user?.accessToken;

  @override
  Future<AuthUser?> signInWithEmail(String email, String password) async {
    user = AuthUser(id: 'u-email', email: email, accessToken: 'token-email');
    _controller.add(user);
    return user;
  }

  @override
  Future<AuthUser?> signUpWithEmail(
    String email,
    String password, {
    String? displayName,
  }) async {
    user = AuthUser(
      id: 'u-signup',
      email: email,
      displayName: displayName,
      accessToken: 'token-signup',
    );
    _controller.add(user);
    return user;
  }

  @override
  Future<void> signInWithGoogle() async {
    user = const AuthUser(
      id: 'u-google',
      email: 'google@bin.vn',
      accessToken: 'token-google',
    );
    _controller.add(user);
  }

  @override
  Future<void> signOut() async {
    user = null;
    _controller.add(null);
  }

  void emitUser(AuthUser? newUser) {
    user = newUser;
    _controller.add(newUser);
  }

  @override
  void dispose() {
    _controller.close();
  }
}

class FakeStoreRepository implements StoreRepository {
  List<StoreDto> stores = [];
  StoreDto? activeStore;
  var clearActiveStoreCallCount = 0;

  FakeStoreRepository({this.stores = const [], this.activeStore});

  @override
  Future<List<StoreDto>> getStores() async => stores;

  @override
  Future<String> createStore({
    required String name,
    required String businessType,
  }) async {
    final newId = 'store-${stores.length + 1}';
    final newStore = StoreDto(
      id: newId,
      name: name,
      slug: name.toLowerCase(),
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
    );
    stores = [...stores, newStore];
    return newId;
  }

  @override
  Future<StoreDto?> getActiveStore() async => activeStore;

  @override
  Future<void> setActiveStore(StoreDto store) async {
    activeStore = store;
  }

  @override
  Future<void> clearActiveStore() async {
    activeStore = null;
    clearActiveStoreCallCount++;
  }
}

void main() {
  const testConfig = AppConfig(
    apiBaseUrl: 'https://api.tap-hoa-bin.vn',
    supabaseUrl: 'https://db.tap-hoa-bin.vn',
    supabaseAnonKey: 'anon_token_123',
  );

  const testStore = StoreDto(
    id: 'store-001',
    name: 'Tạp hóa BIN - Tiệm 1',
    slug: 'bin-1',
    role: 'owner',
    storeType: 'groceries',
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    permissions: StorePermissions(
      canSell: true,
      canManageInventory: true,
      canViewReports: true,
      canManageStaff: true,
    ),
  );

  group('AuthController Lifecycle and Router Guards', () {
    test('transitions to unconfigured when config is missing', () async {
      const invalidConfig = AppConfig(
        apiBaseUrl: '',
        supabaseUrl: '',
        supabaseAnonKey: '',
      );

      final authRepo = FakeAuthRepository();
      final storeRepo = FakeStoreRepository();
      final controller = AuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: invalidConfig,
      );

      await controller.initialize();

      expect(controller.status, equals(AuthStatus.unconfigured));
    });

    test('transitions to signedOut when user is null', () async {
      final authRepo = FakeAuthRepository(user: null);
      final storeRepo = FakeStoreRepository();
      final controller = AuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: testConfig,
      );

      await controller.initialize();

      expect(controller.status, equals(AuthStatus.signedOut));
      expect(controller.user, isNull);
    });

    test('transitions to signedInNeedsStore when user is signed in but has no active store', () async {
      final authRepo = FakeAuthRepository(
        user: const AuthUser(
          id: 'u1',
          email: 'owner@bin.vn',
          accessToken: 'token1',
        ),
      );
      final storeRepo = FakeStoreRepository(activeStore: null);
      final controller = AuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: testConfig,
      );

      await controller.initialize();

      expect(controller.status, equals(AuthStatus.signedInNeedsStore));
      expect(controller.user?.email, equals('owner@bin.vn'));
    });

    test(
      'transitions to ready when user is signed in AND active store exists',
      () async {
        final authRepo = FakeAuthRepository(
          user: const AuthUser(
            id: 'u1',
            email: 'owner@bin.vn',
            accessToken: 'token1',
          ),
        );
        final storeRepo = FakeStoreRepository(activeStore: testStore);
        final controller = AuthController(
          authRepository: authRepo,
          storeRepository: storeRepo,
          config: testConfig,
        );

        await controller.initialize();

        expect(controller.status, equals(AuthStatus.ready));
        expect(controller.user?.email, equals('owner@bin.vn'));
      },
    );

    test(
      'onStoreSelected sets active store and transitions status to ready',
      () async {
        final authRepo = FakeAuthRepository(
          user: const AuthUser(
            id: 'u1',
            email: 'owner@bin.vn',
            accessToken: 'token1',
          ),
        );
        final storeRepo = FakeStoreRepository(activeStore: null);
        final controller = AuthController(
          authRepository: authRepo,
          storeRepository: storeRepo,
          config: testConfig,
        );

        await controller.initialize();
        expect(controller.status, equals(AuthStatus.signedInNeedsStore));

        await controller.onStoreSelected(testStore);

        expect(controller.status, equals(AuthStatus.ready));
        expect(storeRepo.activeStore, equals(testStore));
      },
    );

    test('signOut clears user and clears active store from memory', () async {
      final authRepo = FakeAuthRepository(
        user: const AuthUser(
          id: 'u1',
          email: 'owner@bin.vn',
          accessToken: 'token1',
        ),
      );
      final storeRepo = FakeStoreRepository(activeStore: testStore);
      final controller = AuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: testConfig,
      );

      await controller.initialize();
      expect(controller.status, equals(AuthStatus.ready));

      await controller.signOut();

      expect(controller.status, equals(AuthStatus.signedOut));
      expect(controller.user, isNull);
      expect(storeRepo.activeStore, isNull);
      expect(storeRepo.clearActiveStoreCallCount, greaterThanOrEqualTo(1));
    });

    test(
      'switching accounts clears store from previous account in memory',
      () async {
        final authRepo = FakeAuthRepository(
          user: const AuthUser(
            id: 'user-A',
            email: 'a@bin.vn',
            accessToken: 'tokA',
          ),
        );
        final storeRepo = FakeStoreRepository(activeStore: testStore);
        final controller = AuthController(
          authRepository: authRepo,
          storeRepository: storeRepo,
          config: testConfig,
        );

        await controller.initialize();
        expect(controller.status, equals(AuthStatus.ready));

        // Emit switch to another user account
        authRepo.emitUser(
          const AuthUser(id: 'user-B', email: 'b@bin.vn', accessToken: 'tokB'),
        );
        await Future<void>.delayed(const Duration(milliseconds: 10));

        expect(storeRepo.activeStore, isNull);
        expect(controller.status, equals(AuthStatus.signedInNeedsStore));
      },
    );

    test(
      'signInWithEmail transitions to signedInNeedsStore if no store',
      () async {
        final authRepo = FakeAuthRepository();
        final storeRepo = FakeStoreRepository();
        final controller = AuthController(
          authRepository: authRepo,
          storeRepository: storeRepo,
          config: testConfig,
        );

        await controller.signInWithEmail('nv@bin.vn', 'password123');

        expect(controller.status, equals(AuthStatus.signedInNeedsStore));
        expect(controller.user?.email, equals('nv@bin.vn'));
        expect(controller.error, isNull);
      },
    );

    test(
      'signUpWithEmail sets user and transitions to signedInNeedsStore',
      () async {
        final authRepo = FakeAuthRepository();
        final storeRepo = FakeStoreRepository();
        final controller = AuthController(
          authRepository: authRepo,
          storeRepository: storeRepo,
          config: testConfig,
        );

        await controller.signUpWithEmail(
          'new@bin.vn',
          'password123',
          displayName: 'Chủ Tiệm Mới',
        );

        expect(controller.status, equals(AuthStatus.signedInNeedsStore));
        expect(controller.user?.email, equals('new@bin.vn'));
        expect(controller.user?.displayName, equals('Chủ Tiệm Mới'));
      },
    );

    test('signInWithGoogle updates user session', () async {
      final authRepo = FakeAuthRepository();
      final storeRepo = FakeStoreRepository();
      final controller = AuthController(
        authRepository: authRepo,
        storeRepository: storeRepo,
        config: testConfig,
      );

      await controller.signInWithGoogle();

      expect(controller.user?.email, equals('google@bin.vn'));
      expect(controller.status, equals(AuthStatus.signedInNeedsStore));
    });
  });
}
