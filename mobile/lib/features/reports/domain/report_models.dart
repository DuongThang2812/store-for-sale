/// DTO Tổng hợp số liệu tài chính tính toán từ PostgreSQL Server (`management_report`).
/// KHÔNG tự tính toán trên Client.
class ReportTotals {
  final int revenue;
  final int received;
  final int debt;
  final int repayments;
  final int count;
  final int? cogs;
  final int? grossProfit;
  final double? grossMarginPercent;
  final int currentDebt;
  final int? lossValue;
  final int lowStockCount;
  final int outOfStockCount;

  const ReportTotals({
    required this.revenue,
    required this.received,
    required this.debt,
    required this.repayments,
    required this.count,
    this.cogs,
    this.grossProfit,
    this.grossMarginPercent,
    required this.currentDebt,
    this.lossValue,
    required this.lowStockCount,
    required this.outOfStockCount,
  });

  factory ReportTotals.fromJson(Map<String, dynamic> json) {
    return ReportTotals(
      revenue: (json['revenue'] as num? ?? 0).toInt(),
      received:
          (json['cash_collected'] as num? ?? json['received'] as num? ?? 0)
              .toInt(),
      debt: (json['new_credit'] as num? ?? json['debt'] as num? ?? 0).toInt(),
      repayments: (json['repayments'] as num? ?? 0).toInt(),
      count: (json['sales_count'] as num? ?? json['count'] as num? ?? 0)
          .toInt(),
      cogs: (json['cogs'] as num?)?.toInt(),
      grossProfit: (json['gross_profit'] as num?)?.toInt(),
      grossMarginPercent: (json['gross_margin_percent'] as num?)?.toDouble(),
      currentDebt:
          (json['outstanding_debt'] as num? ??
                  json['current_debt'] as num? ??
                  0)
              .toInt(),
      lossValue: (json['loss_value'] as num?)?.toInt(),
      lowStockCount: (json['low_stock_count'] as num? ?? 0).toInt(),
      outOfStockCount: (json['out_of_stock_count'] as num? ?? 0).toInt(),
    );
  }
}

/// Dòng báo cáo theo ngày.
class DailyReportRow {
  final String dateKey;
  final int revenue;
  final int received;
  final int debt;
  final int count;
  final int? cogs;
  final int? grossProfit;

  const DailyReportRow({
    required this.dateKey,
    required this.revenue,
    required this.received,
    required this.debt,
    required this.count,
    this.cogs,
    this.grossProfit,
  });

  factory DailyReportRow.fromJson(Map<String, dynamic> json) {
    return DailyReportRow(
      dateKey: json['date'] as String? ?? json['date_key'] as String? ?? '',
      revenue: (json['revenue'] as num? ?? 0).toInt(),
      received:
          (json['cash_collected'] as num? ?? json['received'] as num? ?? 0)
              .toInt(),
      debt: (json['new_credit'] as num? ?? json['debt'] as num? ?? 0).toInt(),
      count: (json['sales_count'] as num? ?? json['count'] as num? ?? 0)
          .toInt(),
      cogs: (json['cogs'] as num?)?.toInt(),
      grossProfit: (json['gross_profit'] as num?)?.toInt(),
    );
  }
}

/// Mặt hàng bán chạy nhất theo doanh thu.
class TopProductReport {
  final String id;
  final String name;
  final int revenue;
  final int quantityBase;
  final String baseUnit;

  const TopProductReport({
    required this.id,
    required this.name,
    required this.revenue,
    required this.quantityBase,
    required this.baseUnit,
  });

  factory TopProductReport.fromJson(Map<String, dynamic> json) {
    return TopProductReport(
      id: json['product_id'] as String? ?? json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      revenue: (json['revenue'] as num? ?? 0).toInt(),
      quantityBase: (json['quantity_base'] as num? ?? 0).toInt(),
      baseUnit: json['base_unit'] as String? ?? 'Cái',
    );
  }
}

/// Báo cáo quản trị tổng hợp.
class ManagementReport {
  final int days;
  final String startDate;
  final String endDate;
  final ReportTotals totals;
  final List<DailyReportRow> rows;
  final List<TopProductReport> topProducts;

  const ManagementReport({
    required this.days,
    required this.startDate,
    required this.endDate,
    required this.totals,
    required this.rows,
    required this.topProducts,
  });

  factory ManagementReport.fromJson(int days, Map<String, dynamic> json) {
    final totalsJson = json['totals'] as Map<String, dynamic>? ?? {};
    final rowsList = (json['rows'] as List<dynamic>? ?? [])
        .map((r) => DailyReportRow.fromJson(r as Map<String, dynamic>))
        .toList();
    final topList = (json['top_products_by_revenue'] as List<dynamic>? ?? [])
        .map((p) => TopProductReport.fromJson(p as Map<String, dynamic>))
        .toList();

    return ManagementReport(
      days: days,
      startDate: json['start_date'] as String? ?? '',
      endDate: json['end_date'] as String? ?? '',
      totals: ReportTotals.fromJson(totalsJson),
      rows: rowsList,
      topProducts: topList,
    );
  }
}
