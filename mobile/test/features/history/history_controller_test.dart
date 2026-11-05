import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/history/presentation/history_controller.dart';
import 'package:mobile/features/sales/data/mock_sales_repository.dart';

void main() {
  group('HistoryController Unit Tests (Part 4 Activity Log)', () {
    late MockSalesRepository repository;
    late HistoryController controller;
    const storeId = 'store-test-123';

    setUp(() {
      repository = MockSalesRepository();
      controller = HistoryController(
        salesRepository: repository,
        storeId: storeId,
      );
    });

    test(
      'loadActivities fetches activity timeline from shop_activity',
      () async {
        expect(controller.activities, isEmpty);
        await controller.loadActivities();
        expect(controller.activities.length, 2);
        expect(controller.activities.first.title, contains('DH-0042'));
        expect(controller.error, isNull);
      },
    );

    test('refreshActivities reloads activities', () async {
      await controller.refreshActivities();
      expect(controller.activities.length, 2);
    });
  });
}
