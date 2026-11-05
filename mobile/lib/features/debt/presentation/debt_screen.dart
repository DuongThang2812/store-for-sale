import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../../sales/domain/sales_models.dart';
import 'debt_controller.dart';

/// Màn hình Sổ nợ & Thu nợ khách hàng (Phần 4).
class DebtScreen extends StatefulWidget {
  final DebtController debtController;

  const DebtScreen({super.key, required this.debtController});

  @override
  State<DebtScreen> createState() => _DebtScreenState();
}

class _DebtScreenState extends State<DebtScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.debtController.debtors.isEmpty &&
          !widget.debtController.isLoading) {
        widget.debtController.loadDebtors();
      }
    });
  }

  void _showPaymentDialog(CustomerDebtItem customer) {
    final amountController = TextEditingController(
      text: customer.currentDebt > 0 ? customer.currentDebt.toString() : '',
    );
    final noteController = TextEditingController();
    var paymentMethod = 'cash';
    var isSubmitting = false;
    String? localError;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      'Thu nợ: ${customer.name}',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Dư nợ hiện tại: ${_formatVnd(customer.currentDebt)}',
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFFDC2626),
                      ),
                    ),
                    const SizedBox(height: 16),

                    if (localError != null) ...[
                      Text(
                        localError!,
                        style: const TextStyle(color: Colors.red, fontSize: 13),
                      ),
                      const SizedBox(height: 10),
                    ],

                    TextField(
                      controller: amountController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Số tiền thu (VND) *',
                        prefixIcon: Icon(Icons.payments_outlined),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Chọn phương thức trả nợ
                    Row(
                      children: [
                        const Text(
                          'Phương thức:',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(width: 12),
                        ChoiceChip(
                          label: const Text('Tiền mặt'),
                          selected: paymentMethod == 'cash',
                          onSelected: (_) =>
                              setDialogState(() => paymentMethod = 'cash'),
                        ),
                        const SizedBox(width: 8),
                        ChoiceChip(
                          label: const Text('Chuyển khoản'),
                          selected: paymentMethod == 'bank',
                          onSelected: (_) =>
                              setDialogState(() => paymentMethod = 'bank'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    TextField(
                      controller: noteController,
                      decoration: const InputDecoration(
                        labelText: 'Ghi chú (tùy chọn)',
                        prefixIcon: Icon(Icons.note_alt_outlined),
                      ),
                    ),
                    const SizedBox(height: 20),

                    AppButton(
                      label: 'Xác nhận thu nợ',
                      icon: Icons.check_circle_rounded,
                      isLoading: isSubmitting,
                      onPressed: () async {
                        final val = int.tryParse(amountController.text.trim());
                        if (val == null || val <= 0) {
                          setDialogState(() {
                            localError = 'Vui lòng nhập số tiền hợp lệ.';
                          });
                          return;
                        }

                        setDialogState(() {
                          isSubmitting = true;
                          localError = null;
                        });

                        final res = await widget.debtController.recordPayment(
                          customerId: customer.id,
                          amount: val,
                          paymentMethod: paymentMethod,
                          note: noteController.text.trim(),
                        );

                        if (!context.mounted) return;

                        if (res != null) {
                          Navigator.of(ctx).pop();
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(
                              backgroundColor: const Color(0xFF059669),
                              content: Text(
                                'Đã thu nợ thành công! Dư nợ còn lại: ${_formatVnd(res.remainingDebt)}',
                              ),
                            ),
                          );
                        } else {
                          setDialogState(() {
                            isSubmitting = false;
                            localError =
                                widget.debtController.error?.message ??
                                'Không thể ghi nhận thu nợ.';
                          });
                        }
                      },
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sổ nợ khách hàng'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => widget.debtController.loadDebtors(),
          ),
        ],
      ),
      body: SafeArea(
        child: ListenableBuilder(
          listenable: widget.debtController,
          builder: (context, _) {
            final ctrl = widget.debtController;

            if (ctrl.isLoading) {
              return const AppLoadingView(
                message: 'Đang tải danh sách sổ nợ...',
              );
            }

            if (ctrl.error != null && ctrl.debtors.isEmpty) {
              return AppErrorView(
                message: ctrl.error!.message,
                onRetry: () => ctrl.loadDebtors(),
              );
            }

            if (ctrl.debtors.isEmpty) {
              return const AppEmptyView(
                title: 'Không có nợ tồn đọng',
                message: 'Hiện tại tất cả khách hàng đều đã thanh toán đầy đủ!',
                icon: Icons.verified_outlined,
              );
            }

            return Column(
              children: [
                // Banner tổng dư nợ
                Container(
                  margin: const EdgeInsets.all(12),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFFCA5A5)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Tổng nợ phải thu:',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: Color(0xFF991B1B),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _formatVnd(ctrl.totalOutstandingDebt),
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFDC2626),
                            ),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFFFCA5A5)),
                        ),
                        child: Text(
                          '${ctrl.debtors.length} khách',
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF991B1B),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // Danh sách người nợ
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 6,
                    ),
                    itemCount: ctrl.debtors.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final debtor = ctrl.debtors[index];
                      return Card(
                        elevation: 0,
                        child: Padding(
                          padding: const EdgeInsets.all(14.0),
                          child: Row(
                            children: [
                              CircleAvatar(
                                backgroundColor: const Color(0xFFFEF2F2),
                                child: const Icon(
                                  Icons.person_outline,
                                  color: Color(0xFFDC2626),
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      debtor.name,
                                      style: const TextStyle(
                                        fontSize: 15,
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF0F172A),
                                      ),
                                    ),
                                    if (debtor.phone != null &&
                                        debtor.phone!.isNotEmpty) ...[
                                      const SizedBox(height: 2),
                                      Text(
                                        debtor.phone!,
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: Color(0xFF64748B),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    _formatVnd(debtor.currentDebt),
                                    style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFFDC2626),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  SizedBox(
                                    height: 32,
                                    child: AppButton(
                                      label: 'Thu nợ',
                                      backgroundColor: const Color(0xFF059669),
                                      onPressed: () =>
                                          _showPaymentDialog(debtor),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
