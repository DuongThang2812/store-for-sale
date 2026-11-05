import 'dart:async';
import 'dart:io';

/// Đại diện cho lỗi thống nhất trong ứng dụng Tạp hóa BIN Mobile.
/// Ánh xạ chuẩn với mã lỗi của Backend/Shared API Contract.
class AppError implements Exception {
  final String code;
  final String message;
  final String? requestId;
  final dynamic details;
  final int? httpStatus;

  const AppError({
    required this.code,
    required this.message,
    this.requestId,
    this.details,
    this.httpStatus,
  });

  bool get isAuthError =>
      code == 'UNAUTHORIZED' ||
      code == 'SESSION_EXPIRED' ||
      code == 'FORBIDDEN' ||
      httpStatus == 401;

  bool get isNetworkError =>
      code == 'CONNECTION_FAILED' ||
      code == 'TIMEOUT' ||
      httpStatus == 503 ||
      httpStatus == 504;

  bool get isNotFoundError => code == 'NOT_FOUND' || httpStatus == 404;

  factory AppError.fromHttpStatus(
    int status, {
    String? code,
    String? message,
    String? requestId,
    dynamic details,
  }) {
    final finalCode = code ?? _defaultCodeForStatus(status);
    final finalMessage = message ?? _defaultMessageForCode(finalCode);

    return AppError(
      code: finalCode,
      message: finalMessage,
      requestId: requestId,
      details: details,
      httpStatus: status,
    );
  }

  factory AppError.fromException(dynamic error, {String? requestId}) {
    if (error is AppError) return error;

    if (error is SocketException) {
      return AppError(
        code: 'CONNECTION_FAILED',
        message: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng hoặc địa chỉ máy chủ.',
        requestId: requestId,
        httpStatus: 503,
      );
    }

    if (error is TimeoutException) {
      return AppError(
        code: 'TIMEOUT',
        message: 'Kết nối máy chủ bị quá thời gian. Vui lòng thử lại.',
        requestId: requestId,
        httpStatus: 504,
      );
    }

    return AppError(
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.',
      requestId: requestId,
      details: error.toString(),
      httpStatus: 500,
    );
  }

  static String _defaultCodeForStatus(int status) {
    switch (status) {
      case 401:
        return 'SESSION_EXPIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
      case 503:
        return 'CONNECTION_FAILED';
      default:
        return 'INTERNAL_ERROR';
    }
  }

  static String _defaultMessageForCode(String code) {
    switch (code) {
      case 'UNAUTHORIZED':
      case 'SESSION_EXPIRED':
        return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      case 'FORBIDDEN':
        return 'Tài khoản không có quyền thực hiện thao tác này.';
      case 'STORE_FORBIDDEN':
        return 'Bạn không thuộc danh sách nhân sự của cửa hàng này.';
      case 'NOT_FOUND':
        return 'Không tìm thấy dữ liệu yêu cầu.';
      case 'CONNECTION_FAILED':
        return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng.';
      case 'TIMEOUT':
        return 'Yêu cầu quá thời gian chờ. Vui lòng thử lại.';
      case 'VALIDATION_FAILED':
        return 'Dữ liệu không đúng định dạng yêu cầu.';
      case 'CONFIG_MISSING':
        return 'Ứng dụng chưa được cấu hình địa chỉ máy chủ.';
      default:
        return 'Yêu cầu chưa thực hiện được. Vui lòng thử lại sau.';
    }
  }

  @override
  String toString() =>
      'AppError[$code]: $message (Request: $requestId, Status: $httpStatus)';
}
