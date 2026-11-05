import 'inventory_models.dart';

/// Hợp đồng trừu tượng (abstract interface) cho phân hệ Quản lý kho, Nhập hàng & Kiểm kê.
abstract class InventoryRepository {
  /// Nhập hàng theo đơn vị và giá nhập (RPC `receive_stock`)
  Future<ReceiveStockResult> receiveStock(ReceiveStockIntent intent);

  /// Điều chỉnh số lượng kho / hao hụt (RPC `adjust_stock`)
  Future<AdjustStockResult> adjustStock(AdjustStockIntent intent);

  /// Kiểm kê thực tế định kỳ (RPC `record_inventory_count_reviewed`)
  Future<InventoryCountResult> countStock(InventoryCountIntent intent);

  /// Lấy danh sách danh mục mặt hàng
  Future<List<CategoryItem>> getCategories(String storeId);

  /// Tạo hoặc cập nhật danh mục
  Future<CategoryItem> saveCategory(String storeId, String name);

  /// Lấy danh sách nhà cung cấp
  Future<List<SupplierItem>> getSuppliers(String storeId);

  /// Tạo hoặc cập nhật nhà cung cấp
  Future<SupplierItem> saveSupplier(
    String storeId,
    String name, {
    String? phone,
  });
}
