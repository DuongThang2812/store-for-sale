import 'package:flutter/material.dart';

import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_empty_view.dart';
import '../../../core/widgets/app_error_view.dart';
import '../../../core/widgets/app_loading_view.dart';
import '../domain/sales_models.dart';
import 'pos_controller.dart';

/// Màn hình Bán hàng (POS) & Quản lý Giỏ hàng (Phần 4).
class PosScreen extends StatefulWidget {
  final PosController posController;
  final List<CustomerDebtItem> debtors;

  const PosScreen({
    super.key,
    required this.posController,
    this.debtors = const [],
  });

  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final _searchController = TextEditingController();
  Future<List<CustomerDebtItem>>? _debtorsFuture;

  Future<List<CustomerDebtItem>> _loadDebtors() =>
      _debtorsFuture ??= widget.debtors.isNotEmpty
      ? Future.value(widget.debtors)
      : widget.posController.salesRepository.getDebtors(
          widget.posController.storeId,
        );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (widget.posController.products.isEmpty &&
          !widget.posController.isLoadingProducts) {
        widget.posController.loadProducts();
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _showUnitPicker(ProductItem product) {
    if (product.units.length == 1) {
      widget.posController.addToCart(product, product.units.first);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Đã thêm 1 ${product.units.first.name} vào giỏ.'),
          duration: const Duration(seconds: 1),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Chọn đơn vị bán: ${product.name}',
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 12),
                ...product.units.map((unit) {
                  return ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(
                      Icons.sell_outlined,
                      color: Color(0xFF059669),
                    ),
                    title: Text(
                      unit.name,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    subtitle: Text(
                      '${_formatVnd(unit.salePrice)} / ${unit.name}',
                    ),
                    trailing: AppButton(
                      label: 'Chọn',
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        widget.posController.addToCart(product, unit);
                      },
                    ),
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showCartSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            final ctrl = widget.posController;

            return SafeArea(
              child: Container(
                constraints: BoxConstraints(
                  maxHeight: MediaQuery.of(context).size.height * 0.85,
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 20,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Giỏ hàng (${ctrl.cartCount} món)',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                        if (!ctrl.isCartEmpty)
                          TextButton(
                            onPressed: () {
                              ctrl.clearCart();
                              Navigator.of(ctx).pop();
                            },
                            child: const Text(
                              'Xóa hết',
                              style: TextStyle(color: Colors.red),
                            ),
                          ),
                      ],
                    ),
                    const Divider(height: 1),
                    const SizedBox(height: 10),

                    if (ctrl.isCartEmpty)
                      const Expanded(
                        child: Center(
                          child: Text(
                            'Giỏ hàng đang trống.\nHãy chọn mặt hàng bên dưới để thêm vào giỏ.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Color(0xFF64748B)),
                          ),
                        ),
                      )
                    else ...[
                      Expanded(
                        child: ListView.separated(
                          itemCount: ctrl.cart.length,
                          separatorBuilder: (_, _) => const Divider(height: 1),
                          itemBuilder: (context, index) {
                            final item = ctrl.cart[index];
                            return Padding(
                              padding: const EdgeInsets.symmetric(
                                vertical: 8.0,
                              ),
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.product.name,
                                          style: const TextStyle(
                                            fontWeight: FontWeight.w600,
                                            fontSize: 14,
                                          ),
                                        ),
                                        Text(
                                          '${_formatVnd(item.unit.salePrice)} / ${item.unit.name}',
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: Color(0xFF64748B),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.remove_circle_outline,
                                      size: 22,
                                    ),
                                    onPressed: () {
                                      ctrl.updateQuantity(
                                        index,
                                        item.quantity - 1,
                                      );
                                      setSheetState(() {});
                                    },
                                  ),
                                  Text(
                                    item.quantity % 1 == 0
                                        ? item.quantity.toInt().toString()
                                        : item.quantity.toStringAsFixed(1),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(
                                      Icons.add_circle_outline,
                                      size: 22,
                                    ),
                                    onPressed: () {
                                      ctrl.updateQuantity(
                                        index,
                                        item.quantity + 1,
                                      );
                                      setSheetState(() {});
                                    },
                                  ),
                                  SizedBox(
                                    width: 80,
                                    child: Text(
                                      _formatVnd(item.estimatedTotal),
                                      textAlign: TextAlign.end,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        color: Color(0xFF059669),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Divider(height: 1),
                      const SizedBox(height: 12),

                      // Phương thức thanh toán
                      Row(
                        children: [
                          const Text(
                            'Hình thức:',
                            style: TextStyle(fontWeight: FontWeight.w600),
                          ),
                          const SizedBox(width: 12),
                          ChoiceChip(
                            label: const Text('Tiền mặt'),
                            selected: ctrl.paymentType == 'cash',
                            onSelected: (_) {
                              ctrl.setPaymentType('cash');
                              setSheetState(() {});
                            },
                          ),
                          const SizedBox(width: 8),
                          ChoiceChip(
                            label: const Text('Ghi nợ'),
                            selected: ctrl.paymentType == 'credit',
                            onSelected: (_) {
                              ctrl.setPaymentType('credit');
                              setSheetState(() {});
                            },
                          ),
                        ],
                      ),

                      if (ctrl.paymentType == 'credit') ...[
                        const SizedBox(height: 10),
                        FutureBuilder<List<CustomerDebtItem>>(
                          future: _loadDebtors(),
                          builder: (context, snapshot) {
                            if (snapshot.connectionState !=
                                ConnectionState.done) {
                              return const Center(
                                child: CircularProgressIndicator(),
                              );
                            }
                            if (snapshot.hasError) {
                              return TextButton(
                                onPressed: () {
                                  _debtorsFuture = null;
                                  setSheetState(() {});
                                },
                                child: const Text(
                                  'Không tải được khách hàng. Thử lại',
                                ),
                              );
                            }
                            final debtors =
                                snapshot.data ?? const <CustomerDebtItem>[];
                            if (debtors.isEmpty) {
                              return const Text(
                                'Chưa có khách hàng trong sổ nợ.',
                              );
                            }
                            return DropdownButtonFormField<CustomerDebtItem>(
                              initialValue: ctrl.selectedCustomer,
                              hint: const Text('Chọn khách hàng ghi nợ *'),
                              items: debtors.map((d) {
                                return DropdownMenuItem(
                                  value: d,
                                  child: Text(
                                    '${d.name} (${_formatVnd(d.currentDebt)})',
                                  ),
                                );
                              }).toList(),
                              onChanged: (val) {
                                ctrl.setSelectedCustomer(val);
                                setSheetState(() {});
                              },
                            );
                          },
                        ),
                      ],

                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Tổng tiền ước tính:',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            _formatVnd(ctrl.estimatedTotal),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF059669),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      AppButton(
                        label: 'Thanh toán (Tạo đơn)',
                        icon: Icons.check_circle_rounded,
                        isLoading: ctrl.isSubmitting,
                        onPressed: () async {
                          final res = await ctrl.submitSale();
                          if (res != null) {
                            if (!context.mounted) return;
                            Navigator.of(ctx).pop();
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                backgroundColor: const Color(0xFF059669),
                                content: Text(
                                  'Bán hàng thành công! Tổng tiền server: ${_formatVnd(res.totalAmount)} '
                                  '${res.duplicate ? "(Giao dịch trùng lặp)" : ""}',
                                ),
                              ),
                            );
                          } else if (ctrl.error != null) {
                            setSheetState(() {});
                          }
                        },
                      ),
                    ],
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
        title: const Text('Bán hàng (POS)'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => widget.posController.loadProducts(
              query: _searchController.text,
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Thanh tìm kiếm mặt hàng
            Padding(
              padding: const EdgeInsets.all(12.0),
              child: TextField(
                controller: _searchController,
                decoration: InputDecoration(
                  hintText: 'Tìm kiếm sản phẩm theo tên...',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _searchController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear_rounded),
                          onPressed: () {
                            _searchController.clear();
                            widget.posController.loadProducts();
                          },
                        )
                      : null,
                ),
                onChanged: (val) {
                  widget.posController.loadProducts(query: val);
                },
              ),
            ),

            // Danh sách mặt hàng
            Expanded(
              child: ListenableBuilder(
                listenable: widget.posController,
                builder: (context, _) {
                  final ctrl = widget.posController;

                  if (ctrl.isLoadingProducts) {
                    return const AppLoadingView(
                      message: 'Đang tải danh mục mặt hàng...',
                    );
                  }

                  if (ctrl.error != null && ctrl.products.isEmpty) {
                    return AppErrorView(
                      message: ctrl.error!.message,
                      onRetry: () => ctrl.loadProducts(),
                    );
                  }

                  if (ctrl.products.isEmpty) {
                    return const AppEmptyView(
                      title: 'Không tìm thấy sản phẩm',
                      message: 'Thử tìm kiếm với từ khóa khác hoặc thêm sản phẩm trên Web.',
                      icon: Icons.search_off_rounded,
                    );
                  }

                  return ListView.separated(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    itemCount: ctrl.products.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final p = ctrl.products[index];
                      return _buildProductCard(p);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
      // Thanh giỏ hàng nổi phía dưới
      bottomNavigationBar: ListenableBuilder(
        listenable: widget.posController,
        builder: (context, _) {
          final count = widget.posController.cartCount;
          final total = widget.posController.estimatedTotal;

          if (count == 0) return const SizedBox.shrink();

          return Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.08),
                  blurRadius: 8,
                  offset: const Offset(0, -2),
                ),
              ],
            ),
            child: Row(
              children: [
                Badge(
                  label: Text('$count'),
                  backgroundColor: const Color(0xFF059669),
                  child: const Icon(Icons.shopping_cart_outlined, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Tổng tạm tính:',
                        style: TextStyle(
                          fontSize: 12,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      Text(
                        _formatVnd(total),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF059669),
                        ),
                      ),
                    ],
                  ),
                ),
                AppButton(
                  label: 'Xem giỏ & Thu tiền',
                  icon: Icons.arrow_forward_rounded,
                  onPressed: _showCartSheet,
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildProductCard(ProductItem product) {
    final isOut = product.isOutOfStock;
    final isLow = product.isLowStock;
    final baseUnit = product.units.firstWhere(
      (u) => u.isBase,
      orElse: () => product.units.first,
    );

    return Card(
      elevation: 0,
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        title: Text(
          product.name,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 15,
            color: isOut ? const Color(0xFF94A3B8) : const Color(0xFF0F172A),
          ),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4.0),
          child: Row(
            children: [
              Text(
                '${_formatVnd(baseUnit.salePrice)} / ${baseUnit.name}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF059669),
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isOut
                      ? const Color(0xFFFEE2E2)
                      : isLow
                      ? const Color(0xFFFEF3C7)
                      : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  isOut
                      ? 'Hết hàng'
                      : 'Kho: ${product.stockBase % 1 == 0 ? product.stockBase.toInt() : product.stockBase} ${product.baseUnit}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: isOut
                        ? const Color(0xFFDC2626)
                        : isLow
                        ? const Color(0xFFD97706)
                        : const Color(0xFF475569),
                  ),
                ),
              ),
            ],
          ),
        ),
        trailing: IconButton(
          icon: const Icon(
            Icons.add_shopping_cart_rounded,
            color: Color(0xFF059669),
          ),
          onPressed: () => _showUnitPicker(product),
        ),
      ),
    );
  }
}
