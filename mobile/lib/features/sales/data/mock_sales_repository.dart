import '../domain/sales_models.dart';
import '../domain/sales_repository.dart';

/// Triển khai giả lập (Mock) cho Unit/Widget Test và môi trường chưa cấu hình.
class MockSalesRepository implements SalesRepository {
  List<ProductItem> mockProducts = [
    const ProductItem(
      id: 'prod-1',
      storeId: 'store-mock',
      name: 'Mì Hảo Hảo Tôm Chua Cay',
      baseUnit: 'Gói',
      stockBase: 120.0,
      version: 1,
      units: [
        ProductUnitVariant(
          key: 'base',
          name: 'Gói',
          factorToBase: 1.0,
          salePrice: 4500,
          isBase: true,
        ),
        ProductUnitVariant(
          key: 'thung',
          name: 'Thùng',
          factorToBase: 30.0,
          salePrice: 130000,
        ),
      ],
    ),
    const ProductItem(
      id: 'prod-2',
      storeId: 'store-mock',
      name: 'Nước ngọt Coca Cola 330ml',
      baseUnit: 'Lon',
      stockBase: 48.0,
      version: 1,
      units: [
        ProductUnitVariant(
          key: 'base',
          name: 'Lon',
          factorToBase: 1.0,
          salePrice: 10000,
          isBase: true,
        ),
        ProductUnitVariant(
          key: 'loc',
          name: 'Lốc (6 lon)',
          factorToBase: 6.0,
          salePrice: 58000,
        ),
      ],
    ),
    const ProductItem(
      id: 'prod-3',
      storeId: 'store-mock',
      name: 'Gạo ST25 Ông Cua (5kg)',
      baseUnit: 'Túi',
      stockBase: 15.0,
      version: 1,
      units: [
        ProductUnitVariant(
          key: 'base',
          name: 'Túi',
          factorToBase: 1.0,
          salePrice: 180000,
          isBase: true,
        ),
      ],
    ),
  ];

  List<CustomerDebtItem> mockDebtors = [
    const CustomerDebtItem(
      id: 'cust-1',
      storeId: 'store-mock',
      name: 'Cô Ba Hàng Xóm',
      phone: '0901234567',
      currentDebt: 350000,
      note: 'Nợ tiền gạo tháng trước',
    ),
    const CustomerDebtItem(
      id: 'cust-2',
      storeId: 'store-mock',
      name: 'Chú Năm Thợ Hồ',
      phone: '0912345678',
      currentDebt: 120000,
      note: 'Mua bia và thuốc lá',
    ),
  ];

  List<ActivityItem> mockActivities = [
    ActivityItem(
      id: 'act-1',
      kind: 'sale',
      title: 'Bán hàng #DH-0042',
      description: 'Khách thanh toán 130.000đ tiền mặt',
      amount: 130000,
      occurredAt: DateTime.now().subtract(const Duration(minutes: 15)),
    ),
    ActivityItem(
      id: 'act-2',
      kind: 'debt_payment',
      title: 'Thu nợ Cô Ba',
      description: 'Thu 200.000đ tiền mặt',
      amount: 200000,
      occurredAt: DateTime.now().subtract(const Duration(hours: 2)),
    ),
  ];

  @override
  Future<List<ProductItem>> getProducts(String storeId, {String? query}) async {
    await Future.delayed(const Duration(milliseconds: 50));
    if (query == null || query.trim().isEmpty) {
      return mockProducts;
    }
    final q = query.trim().toLowerCase();
    return mockProducts.where((p) {
      return p.name.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Future<SaleResult> createSale(SaleIntent intent) async {
    await Future.delayed(const Duration(milliseconds: 50));
    final total = intent.items.fold<int>(
      0,
      (sum, item) => sum + (item.quantity * item.unit.salePrice).round(),
    );
    return SaleResult(
      saleId: 'mock-sale-${DateTime.now().millisecondsSinceEpoch}',
      totalAmount: total,
    );
  }

  @override
  Future<List<CustomerDebtItem>> getDebtors(String storeId) async {
    await Future.delayed(const Duration(milliseconds: 50));
    return mockDebtors;
  }

  @override
  Future<DebtPaymentResult> recordDebtPayment(DebtPaymentIntent intent) async {
    await Future.delayed(const Duration(milliseconds: 50));
    return DebtPaymentResult(
      paymentId: 'mock-pay-${DateTime.now().millisecondsSinceEpoch}',
      remainingDebt: 0,
    );
  }

  @override
  Future<List<ActivityItem>> getActivities(
    String storeId, {
    int limit = 50,
  }) async {
    await Future.delayed(const Duration(milliseconds: 50));
    return mockActivities;
  }
}
