import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../../sales/domain/sales_models.dart';
import '../../sales/domain/sales_repository.dart';

/// Bộ quản lý trạng thái Sổ nợ & Thu nợ khách hàng.
class DebtController extends ChangeNotifier {
  final SalesRepository salesRepository;
  final String storeId;

  bool _isLoading = false;
  List<CustomerDebtItem> _debtors = const [];
  String _searchQuery = '';
  bool _isSubmitting = false;
  DebtPaymentResult? _lastPaymentResult;
  AppError? _error;

  DebtController({
    required this.salesRepository,
    required this.storeId,
  });

  bool get isLoading => _isLoading;
  List<CustomerDebtItem> get debtors => _debtors;
  String get searchQuery => _searchQuery;

  List<CustomerDebtItem> get filteredDebtors {
    if (_searchQuery.isEmpty) return _debtors;
    final q = _searchQuery.toLowerCase();
    return _debtors.where((d) {
      return d.name.toLowerCase().contains(q) ||
          (d.phone != null && d.phone!.contains(q));
    }).toList();
  }

  bool get isSubmitting => _isSubmitting;
  DebtPaymentResult? get lastPaymentResult => _lastPaymentResult;
  AppError? get error => _error;

  int get totalOutstandingDebt =>
      _debtors.fold(0, (sum, d) => sum + d.currentDebt);

  void search(String q) {
    _searchQuery = q.trim();
    notifyListeners();
  }

  /// Tải danh sách khách hàng có dư nợ
  Future<void> loadDebtors() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _debtors = await salesRepository.getDebtors(storeId);
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Ghi nhận thu nợ từ khách hàng (kèm Request ID chống bấm lặp)
  Future<DebtPaymentResult?> recordPayment({
    CustomerDebtItem? debtor,
    String? customerId,
    required int amount,
    String paymentMethod = 'cash',
    String? note,
    String? customRequestId,
  }) async {
    final effectiveCustomerId = customerId ?? debtor?.id ?? '';
    if (effectiveCustomerId.isEmpty) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Khách hàng không hợp lệ.',
      );
      notifyListeners();
      return null;
    }

    if (amount <= 0) {
      _error = const AppError(
        code: 'VALIDATION_FAILED',
        message: 'Số tiền thanh toán phải lớn hơn 0đ.',
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
        'req-debt-$now-${(now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0')}';

    final intent = DebtPaymentIntent(
      storeId: storeId,
      requestId: requestId,
      customerId: effectiveCustomerId,
      amount: amount,
      paymentMethod: paymentMethod,
      note: note,
    );

    try {
      final result = await salesRepository.recordDebtPayment(intent);
      _lastPaymentResult = result;
      await loadDebtors();
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
