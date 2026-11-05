import 'package:flutter/material.dart';

import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../../sales/domain/sales_models.dart';
import 'history_controller.dart';

/// Màn hình Nhật ký hoạt động & Lịch sử giao dịch (Phần 4).
class HistoryScreen extends StatefulWidget {
  final HistoryController historyController;

  const HistoryScreen({super.key, required this.historyController});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.historyController.activities.isEmpty &&
          !widget.historyController.isLoading) {
        widget.historyController.loadActivities();
      }
    });
  }

  String _formatVnd(int amount) {
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

  String _formatTime(DateTime date) {
    final h = date.hour.toString().padLeft(2, '0');
    final m = date.minute.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    final mo = date.month.toString().padLeft(2, '0');
    return '$h:$m - $d/$mo';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nhật ký giao dịch'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => widget.historyController.loadActivities(),
          ),
        ],
      ),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.historyController,
          builder: (context, _) {
            final ctrl = widget.historyController;

            if (ctrl.isLoading) {
              return const AppLoadingView(
                message: 'Đang tải lịch sử giao dịch...',
              );
            }

            if (ctrl.error != null && ctrl.activities.isEmpty) {
              return AppErrorView(
                message: ctrl.error!.message,
                onRetry: () => ctrl.loadActivities(),
              );
            }

            if (ctrl.activities.isEmpty) {
              return const AppEmptyView(
                title: 'Chưa có giao dịch nào',
                message: 'Các đơn bán hàng, thu nợ và kiểm kho sẽ được ghi lại tại đây.',
                icon: Icons.history_rounded,
              );
            }

            return RefreshIndicator(
              onRefresh: () => ctrl.loadActivities(),
              color: const Color(0xFF059669),
              child: ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: ctrl.activities.length,
                separatorBuilder: (_, _) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final act = ctrl.activities[index];
                  return _buildActivityCard(act);
                },
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildActivityCard(ActivityItem item) {
    IconData icon;
    Color iconColor;
    Color iconBg;

    if (item.kind == 'sale') {
      icon = Icons.point_of_sale_rounded;
      iconColor = const Color(0xFF059669);
      iconBg = const Color(0xFFECFDF5);
    } else if (item.kind == 'debt_payment') {
      icon = Icons.payments_rounded;
      iconColor = const Color(0xFF2563EB);
      iconBg = const Color(0xFFEFF6FF);
    } else if (item.kind == 'cancel_sale') {
      icon = Icons.cancel_outlined;
      iconColor = const Color(0xFFDC2626);
      iconBg = const Color(0xFFFEF2F2);
    } else {
      icon = Icons.inventory_2_outlined;
      iconColor = const Color(0xFFD97706);
      iconBg = const Color(0xFFFEF3C7);
    }

    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(14.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(icon, color: iconColor, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.title,
                    style: const TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xFF475569),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _formatTime(item.occurredAt),
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            if (item.amount != null) ...[
              const SizedBox(width: 8),
              Text(
                _formatVnd(item.amount!),
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w700,
                  color: item.kind == 'cancel_sale'
                      ? const Color(0xFFDC2626)
                      : const Color(0xFF059669),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
