import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../../sales/domain/sales_models.dart';
import '../../sales/domain/sales_repository.dart';
import '../domain/inventory_models.dart';
import '../domain/inventory_repository.dart';

/// Dòng mặt hàng chuẩn bị nhập kho trong giỏ nhập hàng.
class RestockCartLine {
  final ProductItem product;
  final ProductUnitVariant unit;
  double quantity;
  int unitCost;

  RestockCartLine({
    required this.product,
    required this.unit,
    this.quantity = 1.0,
    required this.unitCost,
  });

  int get lineCost => (quantity * unitCost).round();
}

/// Bộ quản lý trạng thái Nhập hàng từ nhà cung cấp (Restock Controller).
class RestockController extends ChangeNotifier {
  final InventoryRepository inventoryRepository;
  final SalesRepository salesRepository;
  final String storeId;

  bool _isLoading = false;
  List<ProductItem> _products = const [];
  List<SupplierItem> _suppliers = const [];
  SupplierItem? _selectedSupplier;

  final List<RestockCartLine> _items = [];
  bool _isSubmitting = false;
  ReceiveStockResult? _lastResult;
  AppError? _error;

  RestockController({
    required this.inventoryRepository,
    required this.salesRepository,
    required this.storeId,
  });

  bool get isLoading => _isLoading;
  List<ProductItem> get products => _products;
  List<SupplierItem> get suppliers => _suppliers;
  SupplierItem? get selectedSupplier => _selectedSupplier;
  List<RestockCartLine> get items => List.unmodifiable(_items);
  bool get isSubmitting => _isSubmitting;
  ReceiveStockResult? get lastResult => _lastResult;
  AppError? get error => _error;

  int get totalEstimatedCost =>
      _items.fold<int>(0, (sum, i) => sum + i.lineCost);

  Future<void> initialize() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final futures = await Future.wait([
        salesRepository.getProducts(storeId),
        inventoryRepository.getSuppliers(storeId),
      ]);
      _products = futures[0] as List<ProductItem>;
      _suppliers = futures[1] as List<SupplierItem>;
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  void selectSupplier(SupplierItem? supplier) {
    _selectedSupplier = supplier;
    notifyListeners();
  }

  void addItem(
    ProductItem product,
    ProductUnitVariant unit, {
    double quantity = 1.0,
    int? defaultCost,
  }) {
    final existingIndex = _items.indexWhere(
      (line) => line.product.id == product.id && line.unit.key == unit.key,
    );

    final cost =
        defaultCost ??
        (unit.isBase ? unit.salePrice ~/ 1.2 : unit.salePrice ~/ 1.2);

    if (existingIndex >= 0) {
      _items[existingIndex].quantity += quantity;
    } else {
      _items.add(
        RestockCartLine(
          product: product,
          unit: unit,
          quantity: quantity,
          unitCost: cost,
        ),
      );
    }
    notifyListeners();
  }

  void updateLine(int index, double quantity, int unitCost) {
    if (index < 0 || index >= _items.length) return;
    if (quantity <= 0) {
      _items.removeAt(index);
    } else {
      _items[index].quantity = quantity;
      _items[index].unitCost = unitCost;
    }
    notifyListeners();
  }

  void removeLine(int index) {
    if (index >= 0 && index < _items.length) {
      _items.removeAt(index);
      notifyListeners();
    }
  }

  void clear() {
    _items.clear();
    _selectedSupplier = null;
    notifyListeners();
  }

  /// Gửi ý định nhập hàng lên server RPC `receive_stock`
  Future<ReceiveStockResult?> submitReceipt({
    String? note,
    String? customRequestId,
  }) async {
    if (_items.isEmpty) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Danh sách nhập hàng đang trống.',
      );
      notifyListeners();
      return null;
    }

    _isSubmitting = true;
    _error = null;
    notifyListeners();

    final now = DateTime.now().millisecondsSinceEpoch;
    final requestId =
        customRequestId ??
        'req-rec-$now-${(now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0')}';

    final intent = ReceiveStockIntent(
      storeId: storeId,
      requestId: requestId,
      items: _items.map((line) {
        return ReceiveStockItemIntent(
          productId: line.product.id,
          unitKey: line.unit.key,
          quantity: line.quantity,
          unitCost: line.unitCost,
        );
      }).toList(),
      supplierId: _selectedSupplier?.id,
      note: note,
    );

    try {
      final res = await inventoryRepository.receiveStock(intent);
      _lastResult = res;
      clear();
      return res;
    } on AppError catch (e) {
      _error = e;
      return null;
    } catch (e) {
      _error = AppError.fromException(e);
      return null;
    } finally {
      _isSubmitting = false;
      notifyListeners();
    }
  }
}
