import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_error.dart';
import '../domain/report_models.dart';
import '../domain/report_repository.dart';

/// Triển khai thực tế của ReportRepository giao tiếp với Supabase PostgreSQL RPC `management_report`.
/// Nghiêm cấm client tự ý tính toán lại các số liệu tài chính; nhận kết quả trực tiếp từ server.
class ReportRepositoryImpl implements ReportRepository {
  final SupabaseClient _supabase;

  ReportRepositoryImpl({required SupabaseClient supabaseClient})
    : _supabase = supabaseClient;

  @override
  Future<ManagementReport> getManagementReport(
    String storeId, {
    int days = 7,
  }) async {
    try {
      final res = await _supabase.rpc(
        'management_report',
        params: {'p_store_id': storeId, 'p_days': days},
      );
      if (res is Map<String, dynamic>) {
        return ManagementReport.fromJson(days, res);
      }
      throw const AppError(
        code: 'INVALID_RESPONSE',
        message: 'Dữ liệu báo cáo từ hệ thống không hợp lệ.',
      );
    } on PostgrestException catch (e) {
      throw AppError(
        code: 'VALIDATION_FAILED',
        message: e.message,
        details: e.details,
      );
    } catch (e) {
      throw AppError.fromException(e);
    }
  }
}
