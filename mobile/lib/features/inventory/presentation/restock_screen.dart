import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../../sales/domain/sales_models.dart';
import '../domain/inventory_models.dart';
import 'restock_controller.dart';

/// Màn hình Nhập hàng từ Nhà cung cấp (Phần 5).
class RestockScreen extends StatefulWidget {
  final RestockController restockController;

  const RestockScreen({super.key, required this.restockController});

  @override
  State<RestockScreen> createState() => _RestockScreenState();
}

class _RestockScreenState extends State<RestockScreen> {
  final _noteController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.restockController.products.isEmpty &&
          !widget.restockController.isLoading) {
        widget.restockController.initialize();
      }
    });
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  String _formatVnd(int amount) {
    final str = amount.toString();
    final buffer = StringBuffer();
    for (var i = 0; i < str.length; i++) {
      if (i > 0 && (str.length - i) % 3 == 0) {
        buffer.write('.');
      }
      buffer.write(str[i]);
    }
    return '${buffer.toString()}đ';
  }

  void _showAddProductDialog() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        final products = widget.restockController.products;
        return Padding(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Chọn mặt hàng nhập kho',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.5,
                ),
                child: products.isEmpty
                    ? const AppEmptyView(
                        title: 'Không có mặt hàng',
                        message: 'Vui lòng kiểm tra danh mục.',
                      )
                    : ListView.separated(
                        itemCount: products.length,
                        separatorBuilder: (c, i) => const SizedBox(height: 8),
                        itemBuilder: (context, idx) {
                          final p = products[idx];
                          return Card(
                            elevation: 0,
                            child: ListTile(
                              title: Text(
                                p.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              subtitle: Text(
                                'Tồn: ${p.stockBase} ${p.baseUnit}',
                              ),
                              trailing: const Icon(
                                Icons.add_circle_outline_rounded,
                                color: Color(0xFF059669),
                              ),
                              onTap: () {
                                Navigator.of(ctx).pop();
                                _showItemDetailsDialog(p);
                              },
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showItemDetailsDialog(ProductItem product) {
    final qtyController = TextEditingController(text: '10');
    final costController = TextEditingController(
      text: (product.units.first.salePrice ~/ 1.2).toString(),
    );
    var selectedUnit = product.units.first;

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              title: Text('Nhập: ${product.name}'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (product.units.length > 1) ...[
                      const Text(
                        'Đơn vị quy đổi:',
                        style: TextStyle(
                          fontSize: 13,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        children: product.units.map((u) {
                          final isSelected = u.key == selectedUnit.key;
                          return ChoiceChip(
                            label: Text(u.name),
                            selected: isSelected,
                            onSelected: (val) {
                              if (val) {
                                setDialogState(() {
                                  selectedUnit = u;
                                  costController.text = (u.salePrice ~/ 1.2)
                                      .toString();
                                });
                              }
                            },
                          );
                        }).toList(),
                      ),
                      const SizedBox(height: 14),
                    ],

                    TextField(
                      controller: qtyController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText: 'Số lượng nhập (${selectedUnit.name}) *',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 14),

                    TextField(
                      controller: costController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: 'Giá nhập 1 ${selectedUnit.name} (VNĐ) *',
                        border: const OutlineInputBorder(),
                      ),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('Hủy'),
                ),
                ElevatedButton(
                  onPressed: () {
                    final qty = double.tryParse(qtyController.text.trim()) ?? 0;
                    final cost = int.tryParse(costController.text.trim()) ?? 0;
                    if (qty <= 0 || cost <= 0) return;

                    widget.restockController.addItem(
                      product,
                      selectedUnit,
                      quantity: qty,
                      defaultCost: cost,
                    );
                    Navigator.of(ctx).pop();
                  },
                  child: const Text('Thêm vào phiếu'),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.restockController;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Nhập hàng'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_shopping_cart_rounded),
            tooltip: 'Chọn hàng nhập',
            onPressed: _showAddProductDialog,
          ),
        ],
      ),
      body: ListenableBuilder(
        listenable: ctrl,
        builder: (context, _) {
          if (ctrl.isLoading && ctrl.products.isEmpty) {
            return const AppLoadingView(message: 'Đang tải thông tin...');
          }

          if (ctrl.error != null && ctrl.items.isEmpty) {
            return AppErrorView(
              message: ctrl.error!.message,
              onRetry: () => ctrl.initialize(),
            );
          }

          return Column(
            children: [
              // Chọn nhà cung cấp
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: DropdownButtonFormField<SupplierItem>(
                  initialValue: ctrl.selectedSupplier,
                  decoration: const InputDecoration(
                    labelText: 'Nhà cung cấp (tùy chọn)',
                    prefixIcon: Icon(Icons.local_shipping_outlined),
                    border: OutlineInputBorder(),
                  ),
                  items: ctrl.suppliers.map((s) {
                    return DropdownMenuItem(value: s, child: Text(s.name));
                  }).toList(),
                  onChanged: (val) => ctrl.selectSupplier(val),
                ),
              ),

              // Danh sách mặt hàng nhập
              Expanded(
                child: ctrl.items.isEmpty
                    ? AppEmptyView(
                        title: 'Phiếu nhập đang trống',
                        message: 'Nhấn "Chọn hàng nhập" để bắt đầu lập phiếu.',
                        actionLabel: 'Chọn hàng',
                        onAction: _showAddProductDialog,
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: ctrl.items.length,
                        separatorBuilder: (c, i) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final line = ctrl.items[index];
                          return Card(
                            elevation: 0,
                            child: Padding(
                              padding: const EdgeInsets.all(12.0),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          line.product.name,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          '${line.quantity} ${line.unit.name} × ${_formatVnd(line.unitCost)}',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            color: Color(0xFF64748B),
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          'Thành tiền: ${_formatVnd(line.lineCost)}',
                                          style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600,
                                            color: Color(0xFF0F172A),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.delete_outline_rounded,
                                      color: Color(0xFFDC2626),
                                    ),
                                    onPressed: () => ctrl.removeLine(index),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),

              // Thanh tổng kết phiếu nhập
              if (ctrl.items.isNotEmpty)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        offset: const Offset(0, -2),
                        blurRadius: 8,
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Tổng tiền nhập dự kiến:'),
                          Text(
                            _formatVnd(ctrl.totalEstimatedCost),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF059669),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      AppButton(
                        label: 'Lưu phiếu nhập kho',
                        isLoading: ctrl.isSubmitting,
                        onPressed: () async {
                          final messenger = ScaffoldMessenger.of(context);
                          final res = await ctrl.submitReceipt();
                          if (res != null) {
                            messenger.showSnackBar(
                              SnackBar(
                                content: Text(
                                  'Đã nhập kho thành công: ${_formatVnd(res.totalCost)}',
                                ),
                                duration: const Duration(seconds: 2),
                              ),
                            );
                          }
                        },
                      ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
