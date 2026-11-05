import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/reports/data/mock_report_repository.dart';
import 'package:mobile/features/reports/presentation/report_controller.dart';

void main() {
  group('ReportController Unit Tests (Part 5 Management Report & COGS)', () {
    late MockReportRepository reportRepo;
    late ReportController controller;
    const storeId = 'store-test-123';

    setUp(() {
      reportRepo = MockReportRepository();
      controller = ReportController(
        reportRepository: reportRepo,
        storeId: storeId,
      );
    });

    test('loadReport fetches server-computed management report', () async {
      expect(controller.report, isNull);

      await controller.loadReport(days: 7);

      expect(controller.report, isNotNull);
      final r = controller.report!;
      expect(r.days, 7);
      expect(r.totals.revenue, 12500000);
      expect(r.totals.received, 11000000);
      expect(r.totals.debt, 1500000);
      expect(r.totals.cogs, 9200000);
      expect(r.totals.grossProfit, 3300000);
      expect(r.totals.grossMarginPercent, 26.4);
      expect(r.totals.lossValue, 120000);
      expect(r.rows.length, 2);
      expect(r.topProducts.length, 2);
    });

    test('loadReport with different period updates selectedDays', () async {
      await controller.loadReport(days: 30);
      expect(controller.selectedDays, 30);
    });
  });
}
