import 'package:flutter/foundation.dart';
import '../../../core/errors/app_error.dart';
import '../domain/sales_models.dart';
import '../domain/sales_repository.dart';

/// Bộ quản lý trạng thái bán hàng POS & Giỏ hàng.
class PosController extends ChangeNotifier {
  final SalesRepository salesRepository;
  final String storeId;

  bool _isLoadingProducts = false;
  List<ProductItem> _products = const [];
  String _searchQuery = '';

  final List<CartItem> _cart = [];
  String _paymentType = 'cash'; // 'cash' hoặc 'credit'
  CustomerDebtItem? _selectedCustomer;

  bool _isSubmitting = false;
  SaleResult? _lastSaleResult;
  AppError? _error;

  PosController({
    required this.salesRepository,
    required this.storeId,
  });

  bool get isLoadingProducts => _isLoadingProducts;
  List<ProductItem> get products => _products;
  String get searchQuery => _searchQuery;

  List<CartItem> get cart => List.unmodifiable(_cart);
  String get paymentType => _paymentType;
  CustomerDebtItem? get selectedCustomer => _selectedCustomer;

  bool get isSubmitting => _isSubmitting;
  SaleResult? get lastSaleResult => _lastSaleResult;
  AppError? get error => _error;

  int get cartCount => _cart.length;
  bool get isCartEmpty => _cart.isEmpty;

  /// Tổng tiền ước tính phía Client để hiển thị nhanh
  int get estimatedTotal =>
      _cart.fold(0, (sum, item) => sum + item.estimatedTotal);

  /// Getter hỗ trợ tương thích
  int get cartTotalAmount => estimatedTotal;

  /// Tìm kiếm sản phẩm
  Future<void> search(String query) => loadProducts(query: query);

  /// Tải danh mục mặt hàng theo từ khóa tìm kiếm
  Future<void> loadProducts({String? query}) async {
    _isLoadingProducts = true;
    _searchQuery = query ?? '';
    _error = null;
    notifyListeners();

    try {
      _products = await salesRepository.getProducts(storeId, query: query);
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoadingProducts = false;
      notifyListeners();
    }
  }

  /// Thêm mặt hàng và đơn vị vào giỏ hàng
  void addToCart(
    ProductItem product,
    ProductUnitVariant unit, {
    double quantity = 1.0,
  }) {
    final existingIndex = _cart.indexWhere(
      (item) => item.product.id == product.id && item.unit.key == unit.key,
    );

    if (existingIndex >= 0) {
      _cart[existingIndex].quantity += quantity;
    } else {
      _cart.add(CartItem(product: product, unit: unit, quantity: quantity));
    }
    notifyListeners();
  }

  /// Cập nhật số lượng mặt hàng trong giỏ
  void updateQuantity(int index, double newQuantity) {
    if (index < 0 || index >= _cart.length) return;

    if (newQuantity <= 0) {
      _cart.removeAt(index);
    } else {
      _cart[index].quantity = newQuantity;
    }
    notifyListeners();
  }

  /// Đổi đơn vị quy đổi của mặt hàng trong giỏ
  void updateUnit(int index, ProductUnitVariant newUnit) {
    if (index >= 0 && index < _cart.length) {
      _cart[index] = CartItem(
        product: _cart[index].product,
        unit: newUnit,
        quantity: _cart[index].quantity,
      );
      notifyListeners();
    }
  }

  /// Xóa một dòng hàng khỏi giỏ
  void removeFromCart(int index) {
    if (index >= 0 && index < _cart.length) {
      _cart.removeAt(index);
      notifyListeners();
    }
  }

  /// Xóa toàn bộ giỏ hàng
  void clearCart() {
    _cart.clear();
    _selectedCustomer = null;
    _paymentType = 'cash';
    notifyListeners();
  }

  void setPaymentType(String type) {
    _paymentType = type;
    if (type == 'cash') {
      _selectedCustomer = null;
    }
    notifyListeners();
  }

  void setSelectedCustomer(CustomerDebtItem? customer) {
    _selectedCustomer = customer;
    notifyListeners();
  }

  void selectCustomer(CustomerDebtItem? customer) {
    setSelectedCustomer(customer);
  }

  /// Thực hiện tạo đơn bán hàng (Gửi Intent và RequestId chống trùng lặp)
  Future<SaleResult?> submitSale({String? customRequestId}) async {
    if (_cart.isEmpty) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Giỏ hàng đang trống.',
      );
      notifyListeners();
      return null;
    }

    if (_paymentType == 'credit' && _selectedCustomer == null) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Bán chịu bắt buộc phải chọn khách hàng.',
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
        'req-sale-$now-${(now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0')}';

    final intent = SaleIntent(
      storeId: storeId,
      requestId: requestId,
      items: List.from(_cart),
      paymentType: _paymentType,
      customerId: _selectedCustomer?.id,
    );

    try {
      final result = await salesRepository.createSale(intent);
      _lastSaleResult = result;
      clearCart();
      // Tải lại danh mục để cập nhật số tồn kho mới nhất
      await loadProducts(query: _searchQuery);
      return result;
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
