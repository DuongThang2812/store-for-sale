import '../../../core/errors/app_error.dart';
import '../../../core/network/api_client.dart';
import '../domain/store_models.dart';
import '../domain/store_repository.dart';

/// Triển khai thực tế của StoreRepository giao tiếp với Backend / Edge Function.
class StoreRepositoryImpl implements StoreRepository {
  final ApiClient apiClient;
  StoreDto? _activeStore;

  StoreRepositoryImpl({required this.apiClient});

  @override
  Future<List<StoreDto>> getStores() async {
    // Đường dẫn khớp với GET /api/v1/stores hoặc Edge Function /stores từ Phần 1
    final response = await apiClient.get<List<StoreDto>>(
      '/stores',
      parser: (dynamic dataJson) {
        if (dataJson is! List) return <StoreDto>[];
        return dataJson
            .map((item) => StoreDto.fromJson(item as Map<String, dynamic>))
            .toList();
      },
    );

    if (!response.success || response.data == null) {
      throw response.error ??
          const AppError(
            code: 'INTERNAL_ERROR',
            message: 'Không thể tải danh sách cửa hàng.',
          );
    }

    return response.data!;
  }

  @override
  Future<StoreDto?> getActiveStore() async {
    return _activeStore;
  }

  @override
  Future<void> setActiveStore(StoreDto store) async {
    _activeStore = store;
  }

  @override
  Future<void> clearActiveStore() async {
    _activeStore = null;
  }
}
