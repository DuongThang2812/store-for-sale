import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../../sales/domain/sales_models.dart';
import '../domain/inventory_models.dart';
import 'inventory_controller.dart';

/// Màn hình Kiểm kê & Điều chỉnh hao hụt (Phần 5).
class InventoryScreen extends StatefulWidget {
  final InventoryController inventoryController;
  final bool canCount;

  const InventoryScreen({
    super.key,
    required this.inventoryController,
    this.canCount = true,
  });

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: widget.canCount ? 2 : 1,
      vsync: this,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.inventoryController.products.isEmpty &&
          !widget.inventoryController.isLoading) {
        widget.inventoryController.loadProducts();
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _showCountDialog(ProductItem product) {
    var actualText = '';
    var noteText = '';
    var isSubmitting = false;
    String? dialogError;

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Kiểm kê: ${product.name}',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text('Sổ sách: ${product.stockBase} ${product.baseUnit}'),
                const SizedBox(height: 16),
                TextField(
                  onChanged: (value) => actualText = value,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: 'Số lượng thực đếm (${product.baseUnit}) *',
                    border: const OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  onChanged: (value) => noteText = value,
                  decoration: const InputDecoration(
                    labelText: 'Ghi chú (tùy chọn)',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (dialogError != null) ...[
                  const SizedBox(height: 10),
                  Text(dialogError!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 20),
                AppButton(
                  label: 'Ghi nhận kiểm kê',
                  isLoading: isSubmitting,
                  onPressed: () async {
                    final actual = int.tryParse(actualText.trim());
                    if (actual == null || actual < 0) {
                      setSheetState(
                        () => dialogError =
                            'Vui lòng nhập số lượng nguyên không âm.',
                      );
                      return;
                    }
                    setSheetState(() {
                      isSubmitting = true;
                      dialogError = null;
                    });
                    final messenger = ScaffoldMessenger.of(context);
                    final result = await widget.inventoryController.countStock(
                      items: [
                        InventoryCountLineIntent(
                          productId: product.id,
                          actualBase: actual,
                          expectedVersion: product.version,
                          reason: 'inventory_correction',
                        ),
                      ],
                      note: noteText.trim().isEmpty ? null : noteText.trim(),
                    );
                    if (!sheetContext.mounted) return;
                    if (result != null) {
                      Navigator.of(sheetContext).pop();
                      messenger.showSnackBar(
                        const SnackBar(
                          content: Text('Đã ghi nhận kiểm kê kho.'),
                        ),
                      );
                    } else {
                      setSheetState(() {
                        isSubmitting = false;
                        dialogError =
                            widget.inventoryController.error?.message ??
                            'Không thể ghi nhận kiểm kê.';
                      });
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _showAdjustDialog(ProductItem product) {
    final qtyController = TextEditingController();
    final noteController = TextEditingController();
    var isDeduction =
        true; // true: giảm kho (hao hụt/hỏng), false: tăng kho (kiểm kê thừa)
    var reason = 'spoiled';
    var isSubmitting = false;
    String? dialogError;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 20,
                right: 20,
                top: 20,
                bottom: MediaQuery.of(context).viewInsets.bottom + 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            'Điều chỉnh tồn: ${product.name}',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Tồn hiện tại: ${product.stockBase.toStringAsFixed(product.stockBase.truncateToDouble() == product.stockBase ? 0 : 2)} ${product.baseUnit}',
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF64748B),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Loại điều chỉnh: Giảm (hao hụt) hoặc Tăng (thừa)
                    Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(
                              child: Text('Giảm kho (Hao hụt)'),
                            ),
                            selected: isDeduction,
                            selectedColor: const Color(0xFFFEE2E2),
                            onSelected: (val) {
                              setSheetState(() {
                                isDeduction = true;
                                if (reason == 'inventory_correction') {
                                  reason = 'spoiled';
                                }
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(
                              child: Text('Tăng kho (Cộng bù)'),
                            ),
                            selected: !isDeduction,
                            selectedColor: const Color(0xFFDCFCE7),
                            onSelected: (val) {
                              setSheetState(() {
                                isDeduction = false;
                                reason = 'inventory_correction';
                              });
                            },
                          ),
                        ),
                      ],
                    ),

                    const SizedBox(height: 14),

                    // Lý do điều chỉnh
                    DropdownButtonFormField<String>(
                      initialValue: reason,
                      decoration: const InputDecoration(
                        labelText: 'Lý do điều chỉnh',
                        border: OutlineInputBorder(),
                      ),
                      items: isDeduction
                          ? const [
                              DropdownMenuItem(
                                value: 'spoiled',
                                child: Text('Hư hỏng / Hết hạn'),
                              ),
                              DropdownMenuItem(
                                value: 'damaged',
                                child: Text('Bể vỡ / Móp méo'),
                              ),
                              DropdownMenuItem(
                                value: 'lost',
                                child: Text('Thất thoát / Mất mát'),
                              ),
                              DropdownMenuItem(
                                value: 'personal_use',
                                child: Text('Tiêu dùng gia đình'),
                              ),
                              DropdownMenuItem(
                                value: 'other',
                                child: Text('Lý do khác'),
                              ),
                            ]
                          : const [
                              DropdownMenuItem(
                                value: 'inventory_correction',
                                child: Text('Kiểm kê thừa'),
                              ),
                              DropdownMenuItem(
                                value: 'other',
                                child: Text('Khác'),
                              ),
                            ],
                      onChanged: (val) {
                        if (val != null) setSheetState(() => reason = val);
                      },
                    ),

                    const SizedBox(height: 14),

                    // Số lượng điều chỉnh theo đơn vị gốc
                    TextField(
                      controller: qtyController,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: InputDecoration(
                        labelText:
                            'Số lượng ${isDeduction ? "giảm" : "tăng"} (${product.baseUnit}) *',
                        border: const OutlineInputBorder(),
                      ),
                    ),

                    const SizedBox(height: 14),

                    // Ghi chú
                    TextField(
                      controller: noteController,
                      decoration: const InputDecoration(
                        labelText: 'Ghi chú (tùy chọn)',
                        border: OutlineInputBorder(),
                      ),
                    ),

                    if (dialogError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        dialogError!,
                        style: const TextStyle(
                          color: Color(0xFFDC2626),
                          fontSize: 13,
                        ),
                      ),
                    ],

                    const SizedBox(height: 20),

                    AppButton(
                      label: isDeduction
                          ? 'Xác nhận trừ kho'
                          : 'Xác nhận cộng kho',
                      isLoading: isSubmitting,
                      onPressed: () async {
                        final val = double.tryParse(qtyController.text.trim());
                        if (val == null || val <= 0) {
                          setSheetState(
                            () => dialogError =
                                'Vui lòng nhập số lượng hợp lệ lớn hơn 0.',
                          );
                          return;
                        }

                        setSheetState(() {
                          isSubmitting = true;
                          dialogError = null;
                        });

                        final signedQty = isDeduction
                            ? -val.round()
                            : val.round();
                        final messenger = ScaffoldMessenger.of(context);

                        final res = await widget.inventoryController
                            .adjustStock(
                              productId: product.id,
                              quantityBase: signedQty,
                              reason: reason,
                              note: noteController.text.trim().isEmpty
                                  ? null
                                  : noteController.text.trim(),
                            );

                        if (res != null) {
                          if (ctx.mounted) Navigator.of(ctx).pop();
                          messenger.showSnackBar(
                            SnackBar(
                              content: Text(
                                'Đã cập nhật tồn kho cho "${product.name}".',
                              ),
                              duration: const Duration(seconds: 2),
                            ),
                          );
                        } else {
                          setSheetState(() {
                            isSubmitting = false;
                            dialogError =
                                widget.inventoryController.error?.message ?? 'Không thể điều chỉnh tồn kho. Vui lòng thử lại.';
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

  @override
  Widget build(BuildContext context) {
    final ctrl = widget.inventoryController;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Kiểm kho & Hao hụt'),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            const Tab(text: 'Hao hụt & Điều chỉnh'),
            if (widget.canCount) const Tab(text: 'Kiểm kê định kỳ'),
          ],
        ),
      ),
      body: ListenableBuilder(
        listenable: ctrl,
        builder: (context, _) {
          if (ctrl.isLoading && ctrl.products.isEmpty) {
            return const AppLoadingView(message: 'Đang tải danh mục kho...');
          }

          if (ctrl.error != null && ctrl.products.isEmpty) {
            return AppErrorView(
              message: ctrl.error!.message,
              onRetry: () => ctrl.loadProducts(),
            );
          }

          return TabBarView(
            controller: _tabController,
            children: [
              _buildAdjustTab(ctrl),
              if (widget.canCount) _buildCountTab(ctrl),
            ],
          );
        },
      ),
    );
  }

  Widget _buildAdjustTab(InventoryController ctrl) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12.0),
          child: TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: 'Tìm mặt hàng cần điều chỉnh...',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _searchController.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear_rounded),
                      onPressed: () {
                        _searchController.clear();
                        ctrl.loadProducts();
                      },
                    )
                  : null,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            onChanged: (val) => ctrl.loadProducts(query: val),
          ),
        ),
        Expanded(
          child: ctrl.products.isEmpty
              ? const AppEmptyView(
                  title: 'Không tìm thấy mặt hàng',
                  message: 'Thử tìm với tên hoặc mã khác.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  itemCount: ctrl.products.length,
                  separatorBuilder: (c, i) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final product = ctrl.products[index];
                    return Card(
                      elevation: 0,
                      child: ListTile(
                        leading: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: product.isOutOfStock
                                ? const Color(0xFFFEE2E2)
                                : product.isLowStock
                                ? const Color(0xFFFEF3C7)
                                : const Color(0xFFECFDF5),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.inventory_2_outlined,
                            color: product.isOutOfStock
                                ? const Color(0xFFDC2626)
                                : product.isLowStock
                                ? const Color(0xFFD97706)
                                : const Color(0xFF059669),
                            size: 24,
                          ),
                        ),
                        title: Text(
                          product.name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        subtitle: Text(
                          'Tồn kho: ${product.stockBase.toStringAsFixed(product.stockBase.truncateToDouble() == product.stockBase ? 0 : 2)} ${product.baseUnit}',
                          style: TextStyle(
                            fontSize: 12,
                            color: product.isOutOfStock
                                ? const Color(0xFFDC2626)
                                : const Color(0xFF64748B),
                          ),
                        ),
                        trailing: ElevatedButton.icon(
                          onPressed: () => _showAdjustDialog(product),
                          icon: const Icon(Icons.edit_rounded, size: 16),
                          label: const Text(
                            'Báo hao hụt',
                            style: TextStyle(fontSize: 12),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF1F5F9),
                            foregroundColor: const Color(0xFF0F172A),
                            elevation: 0,
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildCountTab(InventoryController ctrl) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFBFDBFE)),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: Color(0xFF2563EB), size: 20),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'Kiểm kê thực tế định kỳ ghi nhận qua RPC `record_inventory_count_reviewed` nguyên tử.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF1E40AF)),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView.separated(
              itemCount: ctrl.products.length,
              separatorBuilder: (c, i) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final product = ctrl.products[index];
                return Card(
                  elevation: 0,
                  child: ListTile(
                    title: Text(
                      product.name,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      'Sổ sách: ${product.stockBase} ${product.baseUnit}',
                    ),
                    trailing: OutlinedButton(
                      child: const Text('Kiểm đếm'),
                      onPressed: () => _showCountDialog(product),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
