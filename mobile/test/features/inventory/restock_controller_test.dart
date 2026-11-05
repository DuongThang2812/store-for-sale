import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/data/mock_inventory_repository.dart';
import 'package:mobile/features/inventory/presentation/restock_controller.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';

void main() {
  group('RestockController Unit Tests (Part 5 Restock & Suppliers)', () {
    late MockInventoryRepository inventoryRepo;
    late MockSalesRepository salesRepo;
    late RestockController controller;
    const storeId = 'store-test-123';

    setUp(() {
      inventoryRepo = MockInventoryRepository();
      salesRepo = MockSalesRepository();
      controller = RestockController(
        inventoryRepository: inventoryRepo,
        salesRepository: salesRepo,
        storeId: storeId,
      );
    });

    test('initialize loads products and suppliers', () async {
      expect(controller.products, isEmpty);
      expect(controller.suppliers, isEmpty);

      await controller.initialize();

      expect(controller.products.length, 3);
      expect(controller.suppliers.length, 2);
    });

    test(
      'addItem, updateLine, and removeLine manage restock receipt items',
      () async {
        await controller.initialize();
        final product = controller.products.first;
        final unit = product.units.first;

        controller.addItem(product, unit, quantity: 10, defaultCost: 3500);
        expect(controller.items.length, 1);
        expect(controller.totalEstimatedCost, 35000);

        // Update line
        controller.updateLine(0, 20, 3500);
        expect(controller.items.first.quantity, 20);
        expect(controller.totalEstimatedCost, 70000);

        // Remove line
        controller.removeLine(0);
        expect(controller.items, isEmpty);
        expect(controller.totalEstimatedCost, 0);
      },
    );

    test('submitReceipt calls receiveStock and resets receipt state', () async {
      await controller.initialize();
      final product = controller.products.first;
      final unit = product.units.first;
      final supplier = controller.suppliers.first;

      controller.selectSupplier(supplier);
      controller.addItem(product, unit, quantity: 10, defaultCost: 3500);

      final res = await controller.submitReceipt(note: 'Nhập hàng tháng 11');

      expect(res, isNotNull);
      expect(res!.receiptId, isNotEmpty);
      expect(res.totalCost, 35000);
      expect(controller.items, isEmpty);
      expect(controller.selectedSupplier, isNull);
    });
  });
}
