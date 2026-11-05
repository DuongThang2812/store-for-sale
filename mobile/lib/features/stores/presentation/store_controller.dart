import 'package:flutter/foundation.dart';

import '../../../core/errors/app_error.dart';
import '../domain/store_models.dart';
import '../domain/store_repository.dart';

/// Bộ quản lý trạng thái tải và chọn cửa hàng (Store Controller).
class StoreController extends ChangeNotifier {
  final StoreRepository storeRepository;

  bool _isLoading = false;
  List<StoreDto> _stores = const [];
  StoreDto? _selectedStore;
  AppError? _error;

  StoreController({required this.storeRepository});

  bool get isLoading => _isLoading;
  List<StoreDto> get stores => _stores;
  StoreDto? get selectedStore => _selectedStore;
  AppError? get error => _error;
  bool get hasStores => _stores.isNotEmpty;

  /// Tải danh sách cửa hàng từ API / Edge Function
  Future<void> loadStores() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final list = await storeRepository.getStores();
      _stores = list;

      final active = await storeRepository.getActiveStore();
      if (active != null) {
        _selectedStore = active;
      }
    } on AppError catch (e) {
      _error = e;
    } catch (e) {
      _error = AppError.fromException(e);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Chọn cửa hàng kích hoạt
  Future<void> selectStore(StoreDto store) async {
    await storeRepository.setActiveStore(store);
    _selectedStore = store;
    notifyListeners();
  }

  /// Xóa cửa hàng đang chọn
  Future<void> clearStore() async {
    await storeRepository.clearActiveStore();
    _selectedStore = null;
    notifyListeners();
  }
}
