import 'package:flutter/material.dart';

import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import 'report_controller.dart';

/// Màn hình Báo cáo Doanh thu & Lãi lỗ (Phần 5).
/// Toàn bộ số liệu doanh thu, giá vốn (COGS), lợi nhuận gộp và tỷ suất lãi được tính toán
/// độc quyền từ PostgreSQL Server RPC `management_report`.
class ReportScreen extends StatefulWidget {
  final ReportController reportController;

  const ReportScreen({super.key, required this.reportController});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.reportController.report == null &&
          !widget.reportController.isLoading) {
        widget.reportController.loadReport();
      }
    });
  }

  String _formatVnd(int? amount) {
    if (amount == null) return 'Chưa có giá vốn';
    final str = amount.abs().toString();
    final buffer = StringBuffer();
    for (var i = 0; i < str.length; i++) {
      if (i > 0 && (str.length - i) % 3 == 0) {
        buffer.write('.');
      }
      buffer.write(str[i]);
    }
    return '${amount < 0 ? "-" : ""}${buffer.toString()}đ';
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.reportController;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Báo cáo Doanh thu & Lãi lỗ'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Tải lại',
            onPressed: () => ctrl.loadReport(),
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: ctrl,
        builder: (context, _) {
          if (ctrl.isLoading && ctrl.report == null) {
            return const AppLoadingView(message: 'Đang kết xuất báo cáo...');
          }

          if (ctrl.error != null && ctrl.report == null) {
            return AppErrorView(
              message: ctrl.error!.message,
              onRetry: () => ctrl.loadReport(),
            );
          }

          final report = ctrl.report;
          if (report == null) {
            return const AppEmptyView(
              title: 'Chưa có dữ liệu báo cáo',
              message: 'Vui lòng thử chọn khoảng thời gian khác.',
            );
          }

          final totals = report.totals;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Thanh chọn khoảng thời gian (1, 7, 30, 90 ngày)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [1, 7, 30, 90].map((days) {
                    final isSelected = ctrl.selectedDays == days;
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4.0),
                      child: ChoiceChip(
                        label: Text(days == 1 ? 'Hôm nay' : '$days ngày'),
                        selected: isSelected,
                        onSelected: (val) {
                          if (val) ctrl.loadReport(days: days);
                        },
                      ),
                    );
                  }).toList(),
                ),

                const SizedBox(height: 16),

                // Thẻ Doanh thu & Lợi nhuận chính
                Card(
                  elevation: 0,
                  color: const Color(0xFFF8FAFC),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: const BorderSide(color: Color(0xFFE2E8F0)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Column(
                      children: [
                        _buildMetricRow(
                          'Tổng doanh thu:',
                          _formatVnd(totals.revenue),
                          isBold: true,
                          valueColor: const Color(0xFF0F172A),
                        ),
                        const Divider(height: 20),
                        _buildMetricRow(
                          'Tiền thực thu:',
                          _formatVnd(totals.received),
                          valueColor: const Color(0xFF059669),
                        ),
                        const SizedBox(height: 8),
                        _buildMetricRow(
                          'Bán ghi nợ:',
                          _formatVnd(totals.debt),
                          valueColor: const Color(0xFFDC2626),
                        ),
                        const SizedBox(height: 8),
                        _buildMetricRow(
                          'Thu tiền nợ cũ:',
                          _formatVnd(totals.repayments),
                          valueColor: const Color(0xFF2563EB),
                        ),
                        const Divider(height: 20),
                        _buildMetricRow(
                          'Giá vốn (COGS):',
                          _formatVnd(totals.cogs),
                          valueColor: const Color(0xFF64748B),
                        ),
                        const SizedBox(height: 8),
                        _buildMetricRow(
                          'Lợi nhuận gộp:',
                          _formatVnd(totals.grossProfit),
                          isBold: true,
                          valueColor:
                              totals.grossProfit != null &&
                                  totals.grossProfit! >= 0
                              ? const Color(0xFF059669)
                              : const Color(0xFFDC2626),
                        ),
                        if (totals.grossMarginPercent != null) ...[
                          const SizedBox(height: 8),
                          _buildMetricRow(
                            'Tỷ suất lợi nhuận:',
                            '${totals.grossMarginPercent!.toStringAsFixed(1)}%',
                            isBold: true,
                            valueColor: const Color(0xFF7C3AED),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 20),

                // Thẻ chỉ số phụ (Hao hụt & Tồn kho)
                Row(
                  children: [
                    Expanded(
                      child: Card(
                        elevation: 0,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Hao hụt / Hỏng',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                _formatVnd(totals.lossValue),
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                  color: Color(0xFFDC2626),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Card(
                        elevation: 0,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Sắp hết / Hết',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xFF64748B),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${totals.lowStockCount} / ${totals.outOfStockCount}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                  color: Color(0xFFD97706),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                const Text(
                  'Mặt hàng bán chạy nhất',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),

                if (report.topProducts.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Chưa có dữ liệu bán hàng trong kỳ này.'),
                  )
                else
                  ...report.topProducts.map((p) {
                    return Card(
                      elevation: 0,
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: const Color(0xFFEFF6FF),
                          child: Text(
                            '${report.topProducts.indexOf(p) + 1}',
                            style: const TextStyle(
                              color: Color(0xFF2563EB),
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        title: Text(
                          p.name,
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                        subtitle: Text(
                          'Đã bán: ${p.quantityBase} ${p.baseUnit}',
                        ),
                        trailing: Text(
                          _formatVnd(p.revenue),
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ),
                    );
                  }),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMetricRow(
    String label,
    String value, {
    bool isBold = false,
    Color? valueColor,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isBold ? 15 : 13,
            fontWeight: isBold ? FontWeight.bold : FontWeight.normal,
            color: const Color(0xFF334155),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isBold ? 16 : 14,
            fontWeight: isBold ? FontWeight.bold : FontWeight.w600,
            color: valueColor ?? const Color(0xFF0F172A),
          ),
        ),
      ],
    );
  }
}
