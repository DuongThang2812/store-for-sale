import '../errors/app_error.dart';

/// Phong bì phản hồi API dùng chung theo chuẩn Phần 1.
class ApiResponse<T> {
  final bool success;
  final T? data;
  final AppError? error;
  final String? requestId;

  const ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.requestId,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic dataJson) parser, {
    int? httpStatus,
  }) {
    final success = json['success'] as bool? ?? false;
    final reqId = json['requestId'] as String?;

    if (success && json['data'] != null) {
      return ApiResponse<T>(
        success: true,
        data: parser(json['data']),
        requestId: reqId,
      );
    }

    final errorMap = json['error'] as Map<String, dynamic>?;
    final appError = AppError.fromHttpStatus(
      httpStatus ?? 400,
      code: errorMap?['code'] as String?,
      message: errorMap?['message'] as String?,
      requestId: reqId,
      details: errorMap?['details'],
    );

    return ApiResponse<T>(success: false, error: appError, requestId: reqId);
  }

  factory ApiResponse.failure(AppError error) {
    return ApiResponse<T>(
      success: false,
      error: error,
      requestId: error.requestId,
    );
  }
}
