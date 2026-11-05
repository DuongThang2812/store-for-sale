/// Dòng hàng trong ý định nhập kho (Stock Receipt Line Intent).
class ReceiveStockItemIntent {
  final String productId;
  final String unitKey;
  final double quantity;
  final int unitCost;

  const ReceiveStockItemIntent({
    required this.productId,
    required this.unitKey,
    required this.quantity,
    required this.unitCost,
  });

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'unit_key': unitKey,
    'quantity': quantity,
    'unit_cost': unitCost,
  };
}

/// Ý định nhập hàng gửi lên server RPC `receive_stock`.
class ReceiveStockIntent {
  final String storeId;
  final String requestId;
  final List<ReceiveStockItemIntent> items;
  final String? supplierId;
  final String? note;

  const ReceiveStockIntent({
    required this.storeId,
    required this.requestId,
    required this.items,
    this.supplierId,
    this.note,
  });

  Map<String, dynamic> toRpcParams() {
    final params = <String, dynamic>{
      'p_store_id': storeId,
      'p_request_id': requestId,
      'p_items': items.map((i) => i.toJson()).toList(),
      'p_note': note?.trim(),
    };
    if (supplierId != null && supplierId!.isNotEmpty) {
      params['p_supplier_id'] = supplierId;
    }
    return params;
  }
}

/// Kết quả nhập hàng từ server.
class ReceiveStockResult {
  final String receiptId;
  final int totalCost;
  final bool duplicate;

  const ReceiveStockResult({
    required this.receiptId,
    required this.totalCost,
    this.duplicate = false,
  });

  factory ReceiveStockResult.fromRpc(dynamic data) {
    if (data is Map<String, dynamic>) {
      return ReceiveStockResult(
        receiptId:
            data['receipt_id'] as String? ?? data['receiptId'] as String? ?? '',
        totalCost:
            (data['total_cost'] as num? ?? data['totalCost'] as num? ?? 0)
                .toInt(),
        duplicate: data['duplicate'] as bool? ?? false,
      );
    }
    return const ReceiveStockResult(receiptId: '', totalCost: 0);
  }
}

/// Ý định điều chỉnh tồn kho / ghi nhận hao hụt (adjust_stock).
class AdjustStockIntent {
  final String storeId;
  final String requestId;
  final String productId;
  final int quantityBase; // Số lượng điều chỉnh theo đơn vị gốc (âm hoặc dương)
  final String reason; // 'damaged', 'spoiled', 'lost', 'inventory_correction', 'personal_use', 'other'
  final String? note;

  const AdjustStockIntent({
    required this.storeId,
    required this.requestId,
    required this.productId,
    required this.quantityBase,
    required this.reason,
    this.note,
  });

  Map<String, dynamic> toRpcParams() => {
    'p_store_id': storeId,
    'p_request_id': requestId,
    'p_product_id': productId,
    'p_quantity_base': quantityBase,
    'p_reason': reason,
    'p_note': note?.trim(),
  };
}

class AdjustStockResult {
  final String movementId;
  final bool duplicate;

  const AdjustStockResult({required this.movementId, this.duplicate = false});

  factory AdjustStockResult.fromRpc(dynamic data) {
    if (data is Map<String, dynamic>) {
      return AdjustStockResult(
        movementId:
            data['movement_id'] as String? ??
            data['movementId'] as String? ??
            '',
        duplicate: data['duplicate'] as bool? ?? false,
      );
    }
    return const AdjustStockResult(movementId: '');
  }
}

/// Dòng kiểm kê mặt hàng.
class InventoryCountLineIntent {
  final String productId;
  final int actualBase;
  final int expectedVersion;
  final String? reason;

  const InventoryCountLineIntent({
    required this.productId,
    required this.actualBase,
    required this.expectedVersion,
    this.reason,
  });

  Map<String, dynamic> toJson() => {
    'product_id': productId,
    'actual_base': actualBase,
    'expected_version': expectedVersion,
    'reason': reason?.trim(),
  };
}

/// Ý định kiểm kê kho (record_inventory_count_reviewed).
class InventoryCountIntent {
  final String storeId;
  final String requestId;
  final List<InventoryCountLineIntent> items;
  final String? note;

  const InventoryCountIntent({
    required this.storeId,
    required this.requestId,
    required this.items,
    this.note,
  });

  Map<String, dynamic> toRpcParams() => {
    'p_store_id': storeId,
    'p_request_id': requestId,
    'p_items': items.map((i) => i.toJson()).toList(),
    'p_note': note?.trim(),
  };
}

class InventoryCountResult {
  final String countId;
  final int itemsCount;
  final bool duplicate;

  const InventoryCountResult({
    required this.countId,
    required this.itemsCount,
    this.duplicate = false,
  });

  factory InventoryCountResult.fromRpc(dynamic data) {
    if (data is Map<String, dynamic>) {
      return InventoryCountResult(
        countId:
            data['count_id'] as String? ?? data['countId'] as String? ?? '',
        itemsCount: (data['items_count'] as num? ?? 0).toInt(),
        duplicate: data['duplicate'] as bool? ?? false,
      );
    }
    return const InventoryCountResult(countId: '', itemsCount: 0);
  }
}

/// Danh mục nhóm hàng (Category).
class CategoryItem {
  final String id;
  final String name;

  const CategoryItem({required this.id, required this.name});

  factory CategoryItem.fromJson(Map<String, dynamic> json) {
    return CategoryItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
    );
  }
}

/// Nhà cung cấp (Supplier).
class SupplierItem {
  final String id;
  final String name;
  final String? phone;

  const SupplierItem({required this.id, required this.name, this.phone});

  factory SupplierItem.fromJson(Map<String, dynamic> json) {
    return SupplierItem(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String?,
    );
  }
}
