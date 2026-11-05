import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/data/mock_inventory_repository.dart';
import 'package:mobile/features/inventory/domain/inventory_models.dart';
import 'package:mobile/features/inventory/presentation/inventory_controller.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';

void main() {
  group('InventoryController Unit Tests (Part 5 Inventory & Loss)', () {
    late MockInventoryRepository inventoryRepo;
    late MockSalesRepository salesRepo;
    late InventoryController controller;
    const storeId = 'store-test-123';

    setUp(() {
      inventoryRepo = MockInventoryRepository();
      salesRepo = MockSalesRepository();
      controller = InventoryController(
        inventoryRepository: inventoryRepo,
        salesRepository: salesRepo,
        storeId: storeId,
      );
    });

    test('loadProducts populates products from sales repository', () async {
      expect(controller.products, isEmpty);
      await controller.loadProducts();
      expect(controller.products.length, 3);
    });

    test('adjustStock deducts stock for spoiled loss', () async {
      await controller.loadProducts();
      final product = controller.products.first;

      final res = await controller.adjustStock(
        productId: product.id,
        quantityBase: -5,
        reason: 'spoiled',
        note: 'Hết hạn sử dụng',
      );

      expect(res, isNotNull);
      expect(res!.movementId, isNotEmpty);
      expect(controller.error, isNull);
    });

    test('adjustStock rejects 0 quantity', () async {
      await controller.loadProducts();
      final product = controller.products.first;

      final res = await controller.adjustStock(
        productId: product.id,
        quantityBase: 0,
        reason: 'spoiled',
      );

      expect(res, isNull);
      expect(controller.error, isNotNull);
      expect(controller.error!.message, contains('không thể bằng 0'));
    });

    test('countStock submits periodic count items', () async {
      await controller.loadProducts();

      final res = await controller.countStock(
        items: [
          const InventoryCountLineIntent(
            productId: 'prod-1',
            actualBase: 115,
            expectedVersion: 1,
            reason: 'Kiểm kê định kỳ tháng 11',
          ),
        ],
        note: 'Đợt kiểm kê tổng hợp',
      );

      expect(res, isNotNull);
      expect(res!.countId, isNotEmpty);
      expect(res.itemsCount, 1);
    });
  });
}
