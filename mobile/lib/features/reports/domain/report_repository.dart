import 'report_models.dart';

/// Hợp đồng trừu tượng (abstract interface) cho phân hệ Báo cáo Doanh thu & Lãi lỗ.
abstract class ReportRepository {
  /// Lấy báo cáo quản trị tổng hợp từ server RPC `management_report`
  /// Tham số `days`: 1, 7, 30 hoặc 90 ngày.
  Future<ManagementReport> getManagementReport(String storeId, {int days = 7});
}
