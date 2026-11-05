import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/app_config.dart';

void main() {
  group('AppConfig Tests', () {
    test('isConfigured returns false when URLs are empty', () {
      const config = AppConfig(
        apiBaseUrl: '',
        supabaseUrl: '',
        supabaseAnonKey: '',
      );

      expect(config.isConfigured, isFalse);
    });

    test(
      'isConfigured returns false when anon key contains placeholder template',
      () {
        const config = AppConfig(
          apiBaseUrl: 'https://example.com/api',
          supabaseUrl: 'https://example.com',
          supabaseAnonKey: 'your_supabase_publishable_anon_key_here',
        );

        expect(config.isConfigured, isFalse);
      },
    );

    test(
      'isConfigured returns true when valid configurations are provided',
      () {
        const config = AppConfig(
          apiBaseUrl:
              'https://skakrjcahinmzcwaowxc.supabase.co/functions/v1/store-api',
          supabaseUrl: 'https://skakrjcahinmzcwaowxc.supabase.co',
          supabaseAnonKey: 'valid_anon_jwt_token',
        );

        expect(config.isConfigured, isTrue);
      },
    );

    test('copyWith updates properties properly', () {
      const config = AppConfig(
        apiBaseUrl: 'https://api.one.com',
        supabaseUrl: 'https://db.one.com',
        supabaseAnonKey: 'key1',
      );

      final updated = config.copyWith(apiBaseUrl: 'https://api.two.com');

      expect(updated.apiBaseUrl, equals('https://api.two.com'));
      expect(updated.supabaseUrl, equals('https://db.one.com'));
      expect(updated.supabaseAnonKey, equals('key1'));
    });
  });
}
