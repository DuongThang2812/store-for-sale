import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';

/// Lớp cấu hình ứng dụng Tạp hóa BIN Mobile.
///
/// Các giá trị được truyền vào lúc biên dịch qua `--dart-define-from-file=env.json`
/// hoặc `--dart-define=API_BASE_URL=...`.
/// Khi chạy trên Android Emulator, tự động ánh xạ localhost/127.0.0.1 thành 10.0.2.2.
class AppConfig {
  final String apiBaseUrl;
  final String supabaseUrl;
  final String supabaseAnonKey;

  const AppConfig({
    required this.apiBaseUrl,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
  });

  /// Đọc cấu hình từ môi trường biên dịch (build-time environment)
  factory AppConfig.fromEnvironment() {
    const rawApiUrl = String.fromEnvironment('API_BASE_URL', defaultValue: '');
    const rawSupabaseUrl = String.fromEnvironment(
      'SUPABASE_URL',
      defaultValue: '',
    );
    const rawAnonKey = String.fromEnvironment(
      'SUPABASE_ANON_KEY',
      defaultValue: '',
    );

    return AppConfig(
      apiBaseUrl: _resolveHostForPlatform(rawApiUrl),
      supabaseUrl: _resolveHostForPlatform(rawSupabaseUrl),
      supabaseAnonKey: rawAnonKey,
    );
  }

  /// Kiểm tra cấu hình có đầy đủ và hợp lệ không
  bool get isConfigured {
    if (apiBaseUrl.trim().isEmpty || supabaseUrl.trim().isEmpty) {
      return false;
    }
    // Phát hiện trường hợp người dùng copy file mẫu nhưng chưa điền key thật
    if (supabaseAnonKey.contains('your_supabase_publishable_anon_key_here')) {
      return false;
    }
    return true;
  }

  /// Ánh xạ localhost sang 10.0.2.2 nếu đang chạy trên Android Emulator
  static String _resolveHostForPlatform(String url) {
    if (url.isEmpty) return url;
    if (kIsWeb) return url;

    try {
      if (Platform.isAndroid) {
        return url
            .replaceAll('://localhost:', '://10.0.2.2:')
            .replaceAll('://127.0.0.1:', '://10.0.2.2:');
      }
    } catch (_) {
      // Fallback khi chạy test không có Platform
    }
    return url;
  }

  AppConfig copyWith({
    String? apiBaseUrl,
    String? supabaseUrl,
    String? supabaseAnonKey,
  }) {
    return AppConfig(
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      supabaseUrl: supabaseUrl ?? this.supabaseUrl,
      supabaseAnonKey: supabaseAnonKey ?? this.supabaseAnonKey,
    );
  }
}
