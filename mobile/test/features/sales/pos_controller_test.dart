import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';
import 'package:mobile/features/sales/domain/sales_models.dart';
import 'package:mobile/features/sales/presentation/pos_controller.dart';

void main() {
  group('PosController Unit Tests (Part 4 POS & Cart)', () {
    late MockSalesRepository repository;
    late PosController controller;
    const storeId = 'store-test-123';

    setUp(() {
      repository = MockSalesRepository();
      controller = PosController(salesRepository: repository, storeId: storeId);
    });

    test('loadProducts populates product catalog', () async {
      expect(controller.products, isEmpty);
      await controller.loadProducts();
      expect(controller.products.length, 3);
      expect(controller.products.first.name, contains('Hảo Hảo'));
    });

    test('search filters products correctly', () async {
      await controller.loadProducts();
      await controller.search('coca');
      expect(controller.products.length, 1);
      expect(controller.products.first.name, contains('Coca'));
    });

    test(
      'cart operations: add, increment, change unit, remove, clear',
      () async {
        await controller.loadProducts();
        final product = controller.products.first; // Hảo Hảo
        final defaultUnit = product.units.first; // Gói
        final boxUnit = product.units.last; // Thùng

        // Add default unit
        controller.addToCart(product, defaultUnit);
        expect(controller.cart.length, 1);
        expect(controller.cart.first.quantity, 1.0);
        expect(controller.cartTotalAmount, 4500);

        // Increment
        controller.updateQuantity(0, 2.0);
        expect(controller.cart.first.quantity, 2.0);
        expect(controller.cartTotalAmount, 9000);

        // Change unit to Thùng
        controller.updateUnit(0, boxUnit);
        expect(controller.cart.first.unit.salePrice, 130000);
        expect(controller.cartTotalAmount, 260000);

        // Remove item
        controller.removeFromCart(0);
        expect(controller.cart, isEmpty);
        expect(controller.cartTotalAmount, 0);

        // Add back and clear
        controller.addToCart(product, defaultUnit);
        expect(controller.cart.length, 1);
        controller.clearCart();
        expect(controller.cart, isEmpty);
      },
    );

    test(
      'submitSale with cash payment sends valid idempotent intent',
      () async {
        await controller.loadProducts();
        final product = controller.products.first;
        controller.addToCart(product, product.units.first);

        controller.setPaymentType('cash');
        final result = await controller.submitSale();

        expect(result, isNotNull);
        expect(result!.saleId, isNotEmpty);
        expect(result.totalAmount, 4500);
        expect(controller.cart, isEmpty);
        expect(controller.lastSaleResult, isNotNull);
      },
    );

    test('submitSale with credit requires customer', () async {
      await controller.loadProducts();
      controller.addToCart(
        controller.products.first,
        controller.products.first.units.first,
      );

      controller.setPaymentType('credit');
      controller.selectCustomer(null);

      final result = await controller.submitSale();
      expect(result, isNull);
      expect(controller.error, isNotNull);
      expect(controller.error!.message, contains('chọn khách hàng'));

      // Now set customer
      const customer = CustomerDebtItem(
        id: 'cust-1',
        storeId: storeId,
        name: 'Cô Ba',
        currentDebt: 50000,
      );
      controller.selectCustomer(customer);

      final successResult = await controller.submitSale();
      expect(successResult, isNotNull);
      expect(controller.cart, isEmpty);
    });
  });
}
