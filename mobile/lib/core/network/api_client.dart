import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../errors/app_error.dart';
import 'api_response.dart';

typedef TokenProvider = Future<String?> Function();

/// Client giao tiếp HTTP REST API chuẩn hóa cho ứng dụng Tạp hóa BIN.
///
/// Hỗ trợ:
/// - Bearer token tự động qua `TokenProvider`.
/// - Correlation ID (`X-Correlation-ID`) cho mọi request để truy vết lỗi.
/// - Timeout cấu hình (mặc định 12s).
/// - Tự động retry tối đa 1 lần CHỈ cho các yêu cầu đọc an toàn (GET),
///   TUYỆT ĐỐI KHÔNG retry các yêu cầu ghi (POST/PUT/DELETE) tiền, kho, nợ.
class ApiClient {
  final AppConfig config;
  final http.Client _client;
  final TokenProvider? tokenProvider;
  final Duration timeout;

  ApiClient({
    required this.config,
    http.Client? client,
    this.tokenProvider,
    this.timeout = const Duration(seconds: 12),
  }) : _client = client ?? http.Client();

  /// Tạo Request ID ngẫu nhiên định dạng UUID v4 đơn giản
  String generateCorrelationId() {
    final now = DateTime.now().millisecondsSinceEpoch;
    final rand = (now ^ 0x5DEECE66D).toRadixString(16).padLeft(8, '0');
    return 'c-$now-$rand';
  }

  /// Xây dựng URL đầy đủ từ endpoint
  Uri _buildUri(String path, [Map<String, String>? queryParams]) {
    final baseUrl = config.apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final fullUrl = '$baseUrl$cleanPath';

    final uri = Uri.parse(fullUrl);
    if (queryParams != null && queryParams.isNotEmpty) {
      return uri.replace(
        queryParameters: {...uri.queryParameters, ...queryParams},
      );
    }
    return uri;
  }

  /// Chuẩn bị headers cho request
  Future<Map<String, String>> _buildHeaders({String? correlationId}) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Correlation-ID': correlationId ?? generateCorrelationId(),
    };

    final provider = tokenProvider;
    if (provider != null) {
      final token = await provider();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }

    return headers;
  }

  /// Thực hiện GET request an toàn kèm tùy chọn retry khi rớt mạng/timeout
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, String>? queryParams,
    required T Function(dynamic dataJson) parser,
    bool retryOnFailure = true,
  }) async {
    if (!config.isConfigured) {
      return ApiResponse.failure(
        const AppError(
          code: 'CONFIG_MISSING',
          message: 'Ứng dụng chưa được cấu hình địa chỉ máy chủ.',
          httpStatus: 500,
        ),
      );
    }

    final correlationId = generateCorrelationId();
    final uri = _buildUri(path, queryParams);

    Future<http.Response> execute() async {
      final headers = await _buildHeaders(correlationId: correlationId);
      return _client.get(uri, headers: headers).timeout(timeout);
    }

    http.Response response;
    try {
      response = await execute();
    } catch (firstError) {
      // Chỉ retry 1 lần cho request đọc (GET) khi gặp lỗi mạng/timeout
      if (retryOnFailure) {
        try {
          await Future<void>.delayed(const Duration(milliseconds: 500));
          response = await execute();
        } catch (secondError) {
          return ApiResponse.failure(
            AppError.fromException(secondError, requestId: correlationId),
          );
        }
      } else {
        return ApiResponse.failure(
          AppError.fromException(firstError, requestId: correlationId),
        );
      }
    }

    return _processResponse<T>(response, parser, correlationId);
  }

  /// Thực hiện POST request (Ghi dữ liệu/Tạo lệnh).
  ///
  /// LƯU Ý: KHÔNG BAO GIỜ tự động retry lệnh POST để tránh trùng lặp giao dịch
  /// tiền, trừ kho hoặc ghi nợ!
  Future<ApiResponse<T>> post<T>(
    String path, {
    required dynamic body,
    required T Function(dynamic dataJson) parser,
    String? idempotencyKey,
  }) async {
    if (!config.isConfigured) {
      return ApiResponse.failure(
        const AppError(
          code: 'CONFIG_MISSING',
          message: 'Ứng dụng chưa được cấu hình địa chỉ máy chủ.',
          httpStatus: 500,
        ),
      );
    }

    final correlationId = generateCorrelationId();
    final uri = _buildUri(path);

    try {
      final headers = await _buildHeaders(correlationId: correlationId);
      if (idempotencyKey != null && idempotencyKey.isNotEmpty) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      final response = await _client
          .post(uri, headers: headers, body: jsonEncode(body))
          .timeout(timeout);

      return _processResponse<T>(response, parser, correlationId);
    } catch (e) {
      // Thất bại ngay, KHÔNG RETRY lệnh ghi tiền/kho/nợ!
      return ApiResponse.failure(
        AppError.fromException(e, requestId: correlationId),
      );
    }
  }

  /// Xử lý và giải mã response JSON từ server
  ApiResponse<T> _processResponse<T>(
    http.Response response,
    T Function(dynamic dataJson) parser,
    String correlationId,
  ) {
    Map<String, dynamic> jsonMap;
    try {
      final decoded = utf8.decode(response.bodyBytes);
      jsonMap = jsonDecode(decoded) as Map<String, dynamic>;
    } catch (_) {
      return ApiResponse.failure(
        AppError.fromHttpStatus(
          response.statusCode,
          requestId: correlationId,
          message: response.statusCode >= 500
              ? 'Máy chủ phản hồi lỗi không đúng định dạng.'
              : 'Dữ liệu phản hồi không đúng cấu trúc JSON.',
        ),
      );
    }

    return ApiResponse.fromJson(
      jsonMap,
      parser,
      httpStatus: response.statusCode,
    );
  }

  void close() {
    _client.close();
  }
}
