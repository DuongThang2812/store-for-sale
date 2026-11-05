import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../../sales/domain/sales_models.dart';
import '../../sales/domain/sales_repository.dart';

/// Bộ quản lý trạng thái Nhật ký hoạt động & Lịch sử giao dịch.
class HistoryController extends ChangeNotifier {
  final SalesRepository salesRepository;
  final String storeId;

  bool _isLoading = false;
  List<ActivityItem> _activities = const [];
  AppError? _error;

  HistoryController({required this.salesRepository, required this.storeId});

  bool get isLoading => _isLoading;
  List<ActivityItem> get activities => _activities;
  AppError? get error => _error;

  Future<void> loadActivities() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _activities = await salesRepository.getActivities(storeId);
    } on AppError catch (e) {
      _error = e;
      _activities = const [];
    } catch (e) {
      _error = AppError.fromException(e);
      _activities = const [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refreshActivities() => loadActivities();
}
