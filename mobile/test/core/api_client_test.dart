import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/app_config.dart';
import 'package:mobile/core/network/api_client.dart';

class MockHttpClient extends http.BaseClient {
  final Future<http.Response> Function(http.BaseRequest request) handler;
  final List<http.BaseRequest> recordedRequests = [];

  MockHttpClient(this.handler);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    recordedRequests.add(request);
    final response = await handler(request);
    return http.StreamedResponse(
      Stream.value(response.bodyBytes),
      response.statusCode,
      headers: response.headers,
    );
  }
}

void main() {
  const validConfig = AppConfig(
    apiBaseUrl: 'https://api.tap-hoa-bin.vn/api/v1',
    supabaseUrl: 'https://db.tap-hoa-bin.vn',
    supabaseAnonKey: 'anon_token_123',
  );

  group('ApiClient Tests', () {
    test('returns CONFIG_MISSING when config is invalid', () async {
      const invalidConfig = AppConfig(
        apiBaseUrl: '',
        supabaseUrl: '',
        supabaseAnonKey: '',
      );

      final client = ApiClient(config: invalidConfig);
      final res = await client.get<Map<String, dynamic>>(
        '/stores',
        parser: (data) => data as Map<String, dynamic>,
      );

      expect(res.success, isFalse);
      expect(res.error?.code, equals('CONFIG_MISSING'));
    });

    test('attaches Authorization Bearer token and X-Correlation-ID', () async {
      final mock = MockHttpClient((request) async {
        return http.Response(
          jsonEncode({
            'success': true,
            'data': {'storeCount': 2},
            'requestId': 'req-test-01',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      });

      final client = ApiClient(
        config: validConfig,
        client: mock,
        tokenProvider: () async => 'jwt_super_secret_token',
      );

      final res = await client.get<Map<String, dynamic>>(
        '/stores',
        parser: (data) => data as Map<String, dynamic>,
      );

      expect(res.success, isTrue);
      expect(mock.recordedRequests.length, equals(1));
      final sentReq = mock.recordedRequests.first;
      expect(
        sentReq.headers['authorization'],
        equals('Bearer jwt_super_secret_token'),
      );
      expect(sentReq.headers['x-correlation-id'], isNotNull);
      expect(res.data?['storeCount'], equals(2));
    });

    test(
      'HTTP 401 response translates into SESSION_EXPIRED AppError',
      () async {
        final mock = MockHttpClient((request) async {
          return http.Response(
            jsonEncode({
              'success': false,
              'error': {
                'code': 'SESSION_EXPIRED',
                'message': 'Phiên đã hết hạn.',
              },
              'requestId': 'req-401',
            }),
            401,
            headers: {'content-type': 'application/json'},
          );
        });

        final client = ApiClient(config: validConfig, client: mock);

        final res = await client.get<List<dynamic>>(
          '/stores',
          parser: (data) => data as List<dynamic>,
        );

        expect(res.success, isFalse);
        expect(res.error?.code, equals('SESSION_EXPIRED'));
        expect(res.error?.httpStatus, equals(401));
        expect(res.error?.isAuthError, isTrue);
      },
    );

    test('Network SocketException translates into CONNECTION_FAILED', () async {
      final mock = MockHttpClient((request) async {
        throw const SocketException('Failed host lookup: tap-hoa-bin.vn');
      });

      final client = ApiClient(config: validConfig, client: mock);

      final res = await client.get<List<dynamic>>(
        '/stores',
        parser: (data) => data as List<dynamic>,
      );

      expect(res.success, isFalse);
      expect(res.error?.code, equals('CONNECTION_FAILED'));
      expect(res.error?.httpStatus, equals(503));
      expect(res.error?.isNetworkError, isTrue);
      // Verify safe GET retried once (2 requests total)
      expect(mock.recordedRequests.length, equals(2));
    });

    test('TimeoutException translates into TIMEOUT error', () async {
      final mock = MockHttpClient((request) async {
        throw TimeoutException('Request timed out after 12000ms');
      });

      final client = ApiClient(config: validConfig, client: mock);

      final res = await client.get<List<dynamic>>(
        '/stores',
        parser: (data) => data as List<dynamic>,
      );

      expect(res.success, isFalse);
      expect(res.error?.code, equals('TIMEOUT'));
      expect(res.error?.httpStatus, equals(504));
      expect(res.error?.isNetworkError, isTrue);
    });

    test(
      'POST requests NEVER retry on failure to protect inventory and finances',
      () async {
        var callCount = 0;
        final mock = MockHttpClient((request) async {
          callCount++;
          throw const SocketException('Connection reset by peer');
        });

        final client = ApiClient(config: validConfig, client: mock);

        final res = await client.post<Map<String, dynamic>>(
          '/sales/checkout',
          body: {'storeId': 'store-1', 'items': []},
          parser: (data) => data as Map<String, dynamic>,
        );

        expect(res.success, isFalse);
        expect(res.error?.code, equals('CONNECTION_FAILED'));
        // STRICT REQUIREMENT: Only 1 call, zero retry on POST!
        expect(callCount, equals(1));
      },
    );
  });
}
