# Ví Dụ Tích Hợp Flutter Cho Shared API Contract (Tạp Hóa BIN)

> **Mục tiêu**: Hướng dẫn đội phát triển Flutter kết nối vào Backend API dùng chung, tuân thủ nguyên tắc không sao chép logic nghiệp vụ tiền/kho/nợ sang Dart.

---

## 1. Kiến Trúc Tầng Ứng Dụng Trong Flutter

```
[Flutter UI (Widgets/Screens)]
            │
            ▼
[State Management (Bloc / Riverpod)]
            │
            ▼
[Repository Layer (StoreRepository)]
            │
            ▼
[Shared API Client (StoreApiService)]
            │  (Đính kèm Authorization: Bearer <token>)
            ▼
[Backend API / Supabase Edge Functions]
```

Flutter App chỉ cần thực hiện:
1. Đăng nhập qua thư viện `supabase_flutter` để nhận `Session` và `accessToken`.
2. Gửi `accessToken` vào header `Authorization: Bearer <accessToken>` khi gọi Shared API.
3. Nhận dữ liệu DTO đã được server chuẩn hóa và hiển thị lên giao diện người dùng.

---

## 2. Mã Nguồn Mẫu Chuẩn (Canonical Dart Implementation)

### 2.1. Lớp Phản Hồi Dùng Chung (`api_response.dart`)

```dart
class ApiError {
  final String code;
  final String message;
  final dynamic details;

  ApiError({
    required this.code,
    required this.message,
    this.details,
  });

  factory ApiError.fromJson(Map<String, dynamic> json) {
    return ApiError(
      code: json['code'] as String? ?? 'INTERNAL_ERROR',
      message: json['message'] as String? ?? 'Yêu cầu chưa thực hiện được.',
      details: json['details'],
    );
  }
}

class ApiResponse<T> {
  final bool success;
  final T? data;
  final ApiError? error;
  final String? requestId;

  ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.requestId,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic dataJson) fromJsonT,
  ) {
    final success = json['success'] as bool? ?? false;
    return ApiResponse<T>(
      success: success,
      data: success && json['data'] != null ? fromJsonT(json['data']) : null,
      error: !success && json['error'] != null
          ? ApiError.fromJson(json['error'] as Map<String, dynamic>)
          : null,
      requestId: json['requestId'] as String?,
    );
  }
}
```

### 2.2. DTO Cửa Hàng (`store_dto.dart`)

```dart
class StorePermissions {
  final bool canSell;
  final bool canManageInventory;
  final bool canViewReports;
  final bool canManageStaff;

  StorePermissions({
    required this.canSell,
    required this.canManageInventory,
    required this.canViewReports,
    required this.canManageStaff,
  });

  factory StorePermissions.fromJson(Map<String, dynamic> json) {
    return StorePermissions(
      canSell: json['canSell'] as bool? ?? false,
      canManageInventory: json['canManageInventory'] as bool? ?? false,
      canViewReports: json['canViewReports'] as bool? ?? false,
      canManageStaff: json['canManageStaff'] as bool? ?? false,
    );
  }
}

class StoreDto {
  final String id;
  final String name;
  final String slug;
  final String role;
  final String storeType;
  final String currency;
  final String timezone;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final StorePermissions permissions;

  StoreDto({
    required this.id,
    required this.name,
    required this.slug,
    required this.role,
    required this.storeType,
    required this.currency,
    required this.timezone,
    this.createdAt,
    this.updatedAt,
    required this.permissions,
  });

  factory StoreDto.fromJson(Map<String, dynamic> json) {
    return StoreDto(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      role: json['role'] as String? ?? 'staff',
      storeType: json['storeType'] as String? ?? 'groceries',
      currency: json['currency'] as String? ?? 'VND',
      timezone: json['timezone'] as String? ?? 'Asia/Ho_Chi_Minh',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      permissions: StorePermissions.fromJson(
        json['permissions'] as Map<String, dynamic>? ?? {},
      ),
    );
  }

  bool get isOwner => role == 'owner';
}
```

### 2.3. Service Gọi API (`store_api_service.dart`)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';
import 'api_response.dart';
import 'store_dto.dart';

class StoreApiException implements Exception {
  final String code;
  final String message;
  final String? requestId;

  StoreApiException({
    required this.code,
    required this.message,
    this.requestId,
  });

  @override
  String toString() => 'StoreApiException: [$code] $message (Request: $requestId)';
}

class StoreApiService {
  final String baseUrl;
  final http.Client _client;

  StoreApiService({
    String? baseUrl,
    http.Client? client,
  })  : baseUrl = baseUrl ?? 'https://skakrjcahinmzcwaowxc.supabase.co/functions/v1/store-api',
        _client = client ?? http.Client();

  /// Lấy access token từ phiên đăng nhập Supabase hiện hành
  String? _getAccessToken() {
    final session = Supabase.instance.client.auth.currentSession;
    return session?.accessToken;
  }

  /// Gọi endpoint GET /api/v1/stores
  Future<List<StoreDto>> fetchStores() async {
    final token = _getAccessToken();
    if (token == null || token.isEmpty) {
      throw StoreApiException(
        code: 'UNAUTHORIZED',
        message: 'Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn.',
      );
    }

    final uri = Uri.parse('$baseUrl/stores');
    final response = await _client.get(
      uri,
      headers: {
        'Authorization': 'Bearer $token',
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
      },
    );

    Map<String, dynamic> jsonBody;
    try {
      jsonBody = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
    } catch (e) {
      throw StoreApiException(
        code: 'CONNECTION_FAILED',
        message: 'Không thể kết nối đến máy chủ. Vui lòng thử lại sau.',
      );
    }

    final apiResponse = ApiResponse<List<StoreDto>>.fromJson(
      jsonBody,
      (data) => (data as List<dynamic>)
          .map((item) => StoreDto.fromJson(item as Map<String, dynamic>))
          .toList(),
    );

    if (!apiResponse.success || apiResponse.data == null) {
      final err = apiResponse.error;
      throw StoreApiException(
        code: err?.code ?? 'INTERNAL_ERROR',
        message: err?.message ?? 'Không thể tải danh sách cửa hàng.',
        requestId: apiResponse.requestId,
      );
    }

    return apiResponse.data!;
  }
}
```

---

## 3. Các Quy Tắc Cốt Lõi Cần Tuân Thủ Khi Lập Trình Flutter

1. **Không sao chép thuật toán tính tiền vào Dart**:
   - Khi tạo đơn bán lẻ, Flutter chỉ tổng hợp giỏ hàng gồm `productId`, `unitKey` (hộp/thùng/gói), và `quantity`.
   - Gửi giỏ hàng dưới dạng ý định (intent) lên API `POST /api/v1/sales/checkout`.
   - Tổng tiền hiển thị trên hóa đơn và trừ kho do Server trả về sau khi kiểm tra giá trong DB.

2. **Tiền tệ VND là số nguyên**:
   - Sử dụng kiểu `int` trong Dart cho tiền VND (hỗ trợ số nguyên 64-bit trên mobile platform).
   - Tuyệt đối không dùng `double` để cộng dồn tiền tệ.

3. **Xử lý rớt mạng và lỗi kết nối**:
   - Bắt `StoreApiException` và hiển thị thông báo lỗi rõ ràng cho người dùng.
   - Không tự ý chuyển về dữ liệu mẫu hay tự suy đoán số liệu tài chính khi API báo lỗi.
