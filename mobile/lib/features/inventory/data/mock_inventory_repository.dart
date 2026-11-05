import '../domain/inventory_models.dart';
import '../domain/inventory_repository.dart';

/// Triển khai giả lập (Mock) cho InventoryRepository phục vụ Unit/Widget Test.
class MockInventoryRepository implements InventoryRepository {
  List<CategoryItem> mockCategories = [
    const CategoryItem(id: 'cat-1', name: 'Nước giải khát'),
    const CategoryItem(id: 'cat-2', name: 'Mì ăn liền & Bánh'),
    const CategoryItem(id: 'cat-3', name: 'Gạo & Nông sản'),
  ];

  List<SupplierItem> mockSuppliers = [
    const SupplierItem(
      id: 'sup-1',
      name: 'Đại lý Acecook Miền Nam',
      phone: '0909111222',
    ),
    const SupplierItem(
      id: 'sup-2',
      name: 'Công ty Coca-Cola VN',
      phone: '0908333444',
    ),
  ];

  @override
  Future<ReceiveStockResult> receiveStock(ReceiveStockIntent intent) async {
    await Future.delayed(const Duration(milliseconds: 30));
    final cost = intent.items.fold<int>(
      0,
      (sum, i) => sum + (i.quantity * i.unitCost).round(),
    );
    return ReceiveStockResult(
      receiptId: 'receipt-${DateTime.now().millisecondsSinceEpoch}',
      totalCost: cost,
    );
  }

  @override
  Future<AdjustStockResult> adjustStock(AdjustStockIntent intent) async {
    await Future.delayed(const Duration(milliseconds: 30));
    return AdjustStockResult(
      movementId: 'move-${DateTime.now().millisecondsSinceEpoch}',
    );
  }

  @override
  Future<InventoryCountResult> countStock(InventoryCountIntent intent) async {
    await Future.delayed(const Duration(milliseconds: 30));
    return InventoryCountResult(
      countId: 'count-${DateTime.now().millisecondsSinceEpoch}',
      itemsCount: intent.items.length,
    );
  }

  @override
  Future<List<CategoryItem>> getCategories(String storeId) async {
    await Future.delayed(const Duration(milliseconds: 30));
    return mockCategories;
  }

  @override
  Future<CategoryItem> saveCategory(String storeId, String name) async {
    await Future.delayed(const Duration(milliseconds: 30));
    final item = CategoryItem(
      id: 'cat-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
    );
    mockCategories.add(item);
    return item;
  }

  @override
  Future<List<SupplierItem>> getSuppliers(String storeId) async {
    await Future.delayed(const Duration(milliseconds: 30));
    return mockSuppliers;
  }

  @override
  Future<SupplierItem> saveSupplier(
    String storeId,
    String name, {
    String? phone,
  }) async {
    await Future.delayed(const Duration(milliseconds: 30));
    final item = SupplierItem(
      id: 'sup-${DateTime.now().millisecondsSinceEpoch}',
      name: name,
      phone: phone,
    );
    mockSuppliers.add(item);
    return item;
  }
}
