import 'store_models.dart';

/// Hợp đồng trừu tượng (abstract interface) cho Store Repository.
/// Cho phép tạo FakeStoreRepository trong các bài test mà không cần gọi API thật.
abstract class StoreRepository {
  /// Lấy danh sách cửa hàng của người dùng hiện tại từ API/Edge Function
  Future<List<StoreDto>> getStores();

  /// Tạo cửa hàng mới qua Backend / RPC create_store
  Future<String> createStore({
    required String name,
    required String businessType,
  });

  /// Lấy cửa hàng đang được kích hoạt trong phiên làm việc
  Future<StoreDto?> getActiveStore();

  /// Thiết lập cửa hàng được chọn
  Future<void> setActiveStore(StoreDto store);

  /// Xóa thông tin cửa hàng trong bộ nhớ (dùng khi đăng xuất hoặc đổi tài khoản)
  Future<void> clearActiveStore();
}
