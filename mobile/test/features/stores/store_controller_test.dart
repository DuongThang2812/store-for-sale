import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/errors/app_error.dart';
import 'package:mobile/features/stores/domain/store_models.dart';
import 'package:mobile/features/stores/domain/store_repository.dart';
import 'package:mobile/features/stores/presentation/store_controller.dart';

class MockStoreRepository implements StoreRepository {
  List<StoreDto> Function()? getStoresHandler;
  StoreDto? activeStore;

  @override
  Future<List<StoreDto>> getStores() async {
    if (getStoresHandler != null) {
      return getStoresHandler!();
    }
    return [];
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
  }
}

void main() {
  const store1 = StoreDto(
    id: 's-01',
    name: 'Cơ sở 1',
    slug: 'cs-1',
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

  group('StoreController Tests', () {
    test('loadStores populates list when repository returns stores', () async {
      final repo = MockStoreRepository();
      repo.getStoresHandler = () => [store1];

      final controller = StoreController(storeRepository: repo);

      expect(controller.isLoading, isFalse);
      expect(controller.stores, isEmpty);

      final future = controller.loadStores();
      expect(controller.isLoading, isTrue);

      await future;

      expect(controller.isLoading, isFalse);
      expect(controller.stores.length, equals(1));
      expect(controller.stores.first.id, equals('s-01'));
      expect(controller.error, isNull);
    });

    test('loadStores handles empty store list properly', () async {
      final repo = MockStoreRepository();
      repo.getStoresHandler = () => [];

      final controller = StoreController(storeRepository: repo);
      await controller.loadStores();

      expect(controller.isLoading, isFalse);
      expect(controller.stores, isEmpty);
      expect(controller.hasStores, isFalse);
      expect(controller.error, isNull);
    });

    test(
      'loadStores captures AppError and surfaces user friendly message',
      () async {
        final repo = MockStoreRepository();
        repo.getStoresHandler = () => throw const AppError(
          code: 'CONNECTION_FAILED',
          message: 'Không thể kết nối đến máy chủ.',
          httpStatus: 503,
        );

        final controller = StoreController(storeRepository: repo);
        await controller.loadStores();

        expect(controller.isLoading, isFalse);
        expect(controller.stores, isEmpty);
        expect(controller.error, isNotNull);
        expect(controller.error?.code, equals('CONNECTION_FAILED'));
        expect(controller.error?.httpStatus, equals(503));
      },
    );

    test('selectStore and clearStore update selectedStore properly', () async {
      final repo = MockStoreRepository();
      final controller = StoreController(storeRepository: repo);

      await controller.selectStore(store1);
      expect(controller.selectedStore, equals(store1));
      expect(repo.activeStore, equals(store1));

      await controller.clearStore();
      expect(controller.selectedStore, isNull);
      expect(repo.activeStore, isNull);
    });
  });
}
