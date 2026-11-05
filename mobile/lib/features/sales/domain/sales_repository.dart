import 'sales_models.dart';

/// Hợp đồng trừu tượng (abstract interface) cho phân hệ Bán hàng, Kho & Sổ nợ.
abstract class SalesRepository {
  /// Tìm kiếm danh mục mặt hàng theo từ khóa hoặc tải toàn bộ danh mục
  Future<List<ProductItem>> getProducts(String storeId, {String? query});

  /// Gửi ý định tạo đơn bán hàng (Intent) lên server RPC `create_sale_reviewed`
  Future<SaleResult> createSale(SaleIntent intent);

  /// Lấy danh sách khách hàng có dư nợ từ view `customer_debt_summary`
  Future<List<CustomerDebtItem>> getDebtors(String storeId);

  /// Gửi ý định thu nợ (Debt Payment Intent) lên server RPC `record_debt_payment`
  Future<DebtPaymentResult> recordDebtPayment(DebtPaymentIntent intent);

  /// Lấy danh sách nhật ký giao dịch từ RPC `shop_activity`
  Future<List<ActivityItem>> getActivities(String storeId, {int limit = 50});
}
