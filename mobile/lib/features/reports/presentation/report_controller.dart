import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../domain/report_models.dart';
import '../domain/report_repository.dart';

/// Bộ quản lý trạng thái Báo cáo Doanh thu & Lãi lỗ.
class ReportController extends ChangeNotifier {
  final ReportRepository reportRepository;
  final String storeId;

  int _selectedDays = 7;
  bool _isLoading = false;
  ManagementReport? _report;
  AppError? _error;

  ReportController({required this.reportRepository, required this.storeId});

  int get selectedDays => _selectedDays;
  bool get isLoading => _isLoading;
  ManagementReport? get report => _report;
  AppError? get error => _error;

  Future<void> loadReport({int? days}) async {
    _selectedDays = days ?? _selectedDays;
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _report = await reportRepository.getManagementReport(
        storeId,
        days: _selectedDays,
      );
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
