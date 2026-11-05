import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/debt/presentation/debt_controller.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';

void main() {
  group('DebtController Unit Tests (Part 4 Debt & Collection)', () {
    late MockSalesRepository repository;
    late DebtController controller;
    const storeId = 'store-test-123';

    setUp(() {
      repository = MockSalesRepository();
      controller = DebtController(
        salesRepository: repository,
        storeId: storeId,
      );
    });

    test('loadDebtors loads customer debt summary', () async {
      expect(controller.debtors, isEmpty);
      await controller.loadDebtors();
      expect(controller.debtors.length, 2);
      expect(controller.totalOutstandingDebt, 470000);
    });

    test('search filters debtors correctly', () async {
      await controller.loadDebtors();
      controller.search('Cô Ba');
      expect(controller.filteredDebtors.length, 1);
      expect(controller.filteredDebtors.first.name, contains('Cô Ba'));
    });

    test('recordPayment succeeds with valid payment amount', () async {
      await controller.loadDebtors();
      final debtor = controller.debtors.first;

      final result = await controller.recordPayment(
        debtor: debtor,
        amount: 100000,
        paymentMethod: 'cash',
        note: 'Trả bớt một phần nợ',
      );

      expect(result, isNotNull);
      expect(result!.paymentId, isNotEmpty);
      expect(result.remainingDebt, 0);
      expect(controller.error, isNull);
    });

    test('recordPayment rejects negative or zero amount', () async {
      await controller.loadDebtors();
      final debtor = controller.debtors.first;

      final result = await controller.recordPayment(
        debtor: debtor,
        amount: -50000,
      );

      expect(result, isNull);
      expect(controller.error, isNotNull);
      expect(controller.error!.message, contains('lớn hơn 0'));
    });
  });
}
