import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../../sales/domain/sales_models.dart';
import '../../sales/domain/sales_repository.dart';
import '../domain/inventory_models.dart';
import '../domain/inventory_repository.dart';

/// Bộ quản lý trạng thái Kiểm kê kho & Điều chỉnh hao hụt.
class InventoryController extends ChangeNotifier {
  final InventoryRepository inventoryRepository;
  final SalesRepository salesRepository;
  final String storeId;

  bool _isLoading = false;
  List<ProductItem> _products = const [];
  bool _isSubmitting = false;
  AppError? _error;

  InventoryController({
    required this.inventoryRepository,
    required this.salesRepository,
    required this.storeId,
  });

  bool get isLoading => _isLoading;
  List<ProductItem> get products => _products;
  bool get isSubmitting => _isSubmitting;
  AppError? get error => _error;

  Future<void> loadProducts({String? query}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _products = await salesRepository.getProducts(storeId, query: query);
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Điều chỉnh số lượng tồn kho (Hao hụt, mất mát, kiểm kê sai lệch)
  Future<AdjustStockResult?> adjustStock({
    required String productId,
    required int quantityBase,
    required String reason,
    String? note,
    String? customRequestId,
  }) async {
    if (quantityBase == 0) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Số lượng điều chỉnh không thể bằng 0.',
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
        'req-adj-$now-${(now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0')}';

    final intent = AdjustStockIntent(
      storeId: storeId,
      requestId: requestId,
      productId: productId,
      quantityBase: quantityBase,
      reason: reason,
      note: note,
    );

    try {
      final res = await inventoryRepository.adjustStock(intent);
      await loadProducts();
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

  /// Ghi nhận kiểm kê thực tế định kỳ
  Future<InventoryCountResult?> countStock({
    required List<InventoryCountLineIntent> items,
    String? note,
    String? customRequestId,
  }) async {
    if (items.isEmpty) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Danh sách kiểm kê không được để trống.',
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
        'req-cnt-$now-${(now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0')}';

    final intent = InventoryCountIntent(
      storeId: storeId,
      requestId: requestId,
      items: items,
      note: note,
    );

    try {
      final res = await inventoryRepository.countStock(intent);
      await loadProducts();
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
