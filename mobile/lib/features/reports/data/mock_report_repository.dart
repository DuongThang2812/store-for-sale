import '../domain/report_models.dart';
import '../domain/report_repository.dart';

/// Triển khai giả lập (Mock) cho ReportRepository phục vụ Unit/Widget Test.
class MockReportRepository implements ReportRepository {
  @override
  Future<ManagementReport> getManagementReport(
    String storeId, {
    int days = 7,
  }) async {
    await Future.delayed(const Duration(milliseconds: 30));
    return ManagementReport(
      days: days,
      startDate: '2026-10-29',
      endDate: '2026-11-05',
      totals: const ReportTotals(
        revenue: 12500000,
        received: 11000000,
        debt: 1500000,
        repayments: 800000,
        count: 85,
        cogs: 9200000,
        grossProfit: 3300000,
        grossMarginPercent: 26.4,
        currentDebt: 4500000,
        lossValue: 120000,
        lowStockCount: 4,
        outOfStockCount: 1,
      ),
      rows: [
        const DailyReportRow(
          dateKey: '2026-11-04',
          revenue: 2100000,
          received: 1800000,
          debt: 300000,
          count: 14,
          cogs: 1500000,
          grossProfit: 600000,
        ),
        const DailyReportRow(
          dateKey: '2026-11-05',
          revenue: 1850000,
          received: 1850000,
          debt: 0,
          count: 12,
          cogs: 1300000,
          grossProfit: 550000,
        ),
      ],
      topProducts: [
        const TopProductReport(
          id: 'prod-1',
          name: 'Mì Hảo Hảo Tôm Chua Cay',
          revenue: 3500000,
          quantityBase: 780,
          baseUnit: 'Gói',
        ),
        const TopProductReport(
          id: 'prod-2',
          name: 'Nước ngọt Coca Cola 330ml',
          revenue: 2400000,
          quantityBase: 240,
          baseUnit: 'Lon',
        ),
      ],
    );
  }
}
