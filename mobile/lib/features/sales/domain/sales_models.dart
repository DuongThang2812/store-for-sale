/// Biến thể đơn vị quy đổi của mặt hàng (VD: Gói, Thùng, Hộp, Kg, Lạng).
class ProductUnitVariant {
  final String key;
  final String name;
  final double factorToBase;
  final int salePrice;
  final bool isBase;

  const ProductUnitVariant({
    required this.key,
    required this.name,
    required this.factorToBase,
    required this.salePrice,
    this.isBase = false,
  });

  factory ProductUnitVariant.fromJson(Map<String, dynamic> json) {
    return ProductUnitVariant(
      key: json['key'] as String? ?? 'base',
      name: json['name'] as String? ?? 'Đơn vị',
      factorToBase: (json['factor_to_base'] as num?)?.toDouble() ?? 1.0,
      salePrice: (json['sale_price'] as num?)?.toInt() ?? 0,
      isBase: json['is_base'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'key': key,
    'name': name,
    'factor_to_base': factorToBase,
    'sale_price': salePrice,
    'is_base': isBase,
  };
}

/// DTO Mặt hàng từ view `product_catalog` của Supabase/PostgreSQL.
class ProductItem {
  final String id;
  final String storeId;
  final String name;
  final String? category;
  final String? productGroup;
  final String baseUnit;
  final double stockBase;
  final double lowStockThreshold;
  final int version;
  final bool isActive;
  final List<ProductUnitVariant> units;

  const ProductItem({
    required this.id,
    required this.storeId,
    required this.name,
    this.category,
    this.productGroup,
    required this.baseUnit,
    required this.stockBase,
    this.lowStockThreshold = 0,
    required this.version,
    this.isActive = true,
    this.units = const [],
  });

  bool get isLowStock => stockBase <= lowStockThreshold;
  bool get isOutOfStock => stockBase <= 0;

  factory ProductItem.fromJson(Map<String, dynamic> json) {
    final rawUnits = json['units'];
    var parsedUnits = <ProductUnitVariant>[];

    if (rawUnits is List) {
      parsedUnits = rawUnits
          .map((u) => ProductUnitVariant.fromJson(u as Map<String, dynamic>))
          .toList();
    } else if (rawUnits is Map<String, dynamic>) {
      parsedUnits = rawUnits.entries.map((entry) {
        final val = entry.value as Map<String, dynamic>;
        return ProductUnitVariant.fromJson({...val, 'key': entry.key});
      }).toList();
    }

    if (parsedUnits.isEmpty) {
      parsedUnits = [
        ProductUnitVariant(
          key: 'base',
          name: json['base_unit'] as String? ?? 'Cái',
          factorToBase: 1.0,
          salePrice: (json['sale_price'] as num?)?.toInt() ?? 0,
          isBase: true,
        ),
      ];
    }

    return ProductItem(
      id: json['id'] as String? ?? '',
      storeId: json['store_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      category: json['category'] as String?,
      productGroup: json['product_group'] as String?,
      baseUnit: json['base_unit'] as String? ?? 'Cái',
      stockBase: (json['stock_base'] as num?)?.toDouble() ?? 0.0,
      lowStockThreshold:
          (json['low_stock_threshold'] as num?)?.toDouble() ?? 0.0,
      version: (json['version'] as num?)?.toInt() ?? 1,
      isActive: json['is_active'] as bool? ?? true,
      units: parsedUnits,
    );
  }
}

/// Dòng hàng trong giỏ hàng (Cart Item Intent).
class CartItem {
  final ProductItem product;
  final ProductUnitVariant unit;
  double quantity;

  CartItem({required this.product, required this.unit, this.quantity = 1.0});

  /// Giá ước tính hiển thị trên client (Server tính giá chính thức)
  int get estimatedTotal => (unit.salePrice * quantity).round();

  Map<String, dynamic> toIntentJson() => {
    'product_id': product.id,
    'unit_key': unit.key,
    'quantity': quantity,
    'expected_version': product.version,
  };
}

/// Ý định bán hàng gửi lên server (Sale Intent).
/// Client KHÔNG tự tính tổng tiền, server/RPC chịu trách nhiệm tính toán và trừ kho.
class SaleIntent {
  final String storeId;
  final String requestId;
  final List<CartItem> items;
  final String paymentType; // 'cash' hoặc 'credit'
  final String? customerId; // Bắt buộc khi paymentType == 'credit'

  const SaleIntent({
    required this.storeId,
    required this.requestId,
    required this.items,
    this.paymentType = 'cash',
    this.customerId,
  });

  Map<String, dynamic> toRpcParams() => {
    'p_store_id': storeId,
    'p_request_id': requestId,
    'p_payment_type': paymentType,
    'p_customer_id': customerId,
    'p_items': items.map((i) => i.toIntentJson()).toList(),
  };
}

/// Kết quả giao dịch bán hàng từ server.
class SaleResult {
  final String saleId;
  final int totalAmount;
  final bool duplicate;

  const SaleResult({
    required this.saleId,
    required this.totalAmount,
    this.duplicate = false,
  });

  factory SaleResult.fromRpc(dynamic data) {
    if (data is Map<String, dynamic>) {
      return SaleResult(
        saleId: data['sale_id'] as String? ?? data['saleId'] as String? ?? '',
        totalAmount:
            (data['total_amount'] as num? ?? data['totalAmount'] as num? ?? 0)
                .toInt(),
        duplicate: data['duplicate'] as bool? ?? false,
      );
    }
    return const SaleResult(saleId: '', totalAmount: 0);
  }
}

/// Khách hàng trong sổ nợ (từ view `customer_debt_summary`).
class CustomerDebtItem {
  final String id;
  final String storeId;
  final String name;
  final String? phone;
  final String? note;
  final int currentDebt;
  final bool isInDebtBook;
  final int openInvoiceCount;

  const CustomerDebtItem({
    required this.id,
    required this.storeId,
    required this.name,
    this.phone,
    this.note,
    required this.currentDebt,
    this.isInDebtBook = true,
    this.openInvoiceCount = 0,
  });

  factory CustomerDebtItem.fromJson(Map<String, dynamic> json) {
    return CustomerDebtItem(
      id: json['id'] as String? ?? '',
      storeId: json['store_id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      phone: json['phone'] as String?,
      note: json['note'] as String?,
      currentDebt: (json['current_debt'] as num?)?.toInt() ?? 0,
      isInDebtBook: json['is_in_debt_book'] as bool? ?? true,
      openInvoiceCount: (json['open_invoice_count'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Ý định thu nợ khách hàng (Debt Payment Intent).
class DebtPaymentIntent {
  final String storeId;
  final String requestId;
  final String customerId;
  final int amount;
  final String paymentMethod; // 'cash', 'bank', 'other'
  final String? note;

  const DebtPaymentIntent({
    required this.storeId,
    required this.requestId,
    required this.customerId,
    required this.amount,
    this.paymentMethod = 'cash',
    this.note,
  });

  Map<String, dynamic> toRpcParams() => {
    'p_store_id': storeId,
    'p_request_id': requestId,
    'p_customer_id': customerId,
    'p_amount': amount,
    'p_payment_method': paymentMethod,
    'p_note': note,
  };
}

/// Kết quả thu nợ từ server.
class DebtPaymentResult {
  final String paymentId;
  final int remainingDebt;
  final bool duplicate;

  const DebtPaymentResult({
    required this.paymentId,
    required this.remainingDebt,
    this.duplicate = false,
  });

  factory DebtPaymentResult.fromRpc(dynamic data) {
    if (data is Map<String, dynamic>) {
      return DebtPaymentResult(
        paymentId:
            data['payment_id'] as String? ?? data['paymentId'] as String? ?? '',
        remainingDebt:
            (data['remaining_debt'] as num? ??
                    data['remainingDebt'] as num? ??
                    0)
                .toInt(),
        duplicate: data['duplicate'] as bool? ?? false,
      );
    }
    return const DebtPaymentResult(paymentId: '', remainingDebt: 0);
  }
}

/// Sự kiện giao dịch trong lịch sử (từ RPC `shop_activity`).
class ActivityItem {
  final String id;
  final String kind;
  final String title;
  final String description;
  final int? amount;
  final DateTime occurredAt;
  final String? actorName;

  const ActivityItem({
    required this.id,
    required this.kind,
    required this.title,
    required this.description,
    this.amount,
    required this.occurredAt,
    this.actorName,
  });

  factory ActivityItem.fromJson(Map<String, dynamic> json) {
    final rawDate =
        json['occurred_at'] as String? ??
        json['created_at'] as String? ??
        DateTime.now().toIso8601String();

    return ActivityItem(
      id: json['id'] as String? ?? '',
      kind: json['kind'] as String? ?? json['type'] as String? ?? 'sale',
      title: json['title'] as String? ?? 'Giao dịch',
      description:
          json['description'] as String? ?? json['summary'] as String? ?? '',
      amount: (json['total_amount'] as num? ?? json['amount'] as num?)?.toInt(),
      occurredAt: DateTime.tryParse(rawDate) ?? DateTime.now(),
      actorName: json['actor_name'] as String?,
    );
  }
}
