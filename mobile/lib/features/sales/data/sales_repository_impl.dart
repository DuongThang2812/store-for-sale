import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/network/api_client.dart';
import '../domain/sales_models.dart';
import '../domain/sales_repository.dart';

/// Triển khai thực tế của SalesRepository giao tiếp trực tiếp với Supabase PostgreSQL RPCs
/// và Views đã được bảo vệ bằng RLS:
/// - View `product_catalog`
/// - RPC `create_sale_reviewed`
/// - View `customer_debt_summary`
/// - RPC `record_debt_payment`
/// - RPC `shop_activity`
class SalesRepositoryImpl implements SalesRepository {
  final SupabaseClient _supabase;
  final ApiClient apiClient;

  SalesRepositoryImpl({
    required SupabaseClient supabaseClient,
    required this.apiClient,
  }) : _supabase = supabaseClient;

  @override
  Future<List<ProductItem>> getProducts(String storeId, {String? query}) async {
    try {
      var builder = _supabase
          .from('product_catalog')
          .select()
          .eq('store_id', storeId)
          .eq('is_active', true);

      if (query != null && query.trim().isNotEmpty) {
        builder = builder.ilike('name', '%${query.trim()}%');
      }

      final rows = await builder.order('name');
      return (rows as List<dynamic>)
          .map((row) => ProductItem.fromJson(row as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<SaleResult> createSale(SaleIntent intent) async {
    try {
      final res = await _supabase.rpc(
        'create_sale_reviewed',
        params: intent.toRpcParams(),
      );
      return SaleResult.fromRpc(res);
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

  @override
  Future<List<CustomerDebtItem>> getDebtors(String storeId) async {
    try {
      final rows = await _supabase
          .from('customer_debt_summary')
          .select()
          .eq('store_id', storeId)
          .eq('is_in_debt_book', true)
          .order('name');

      return (rows as List<dynamic>)
          .map((row) => CustomerDebtItem.fromJson(row as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<DebtPaymentResult> recordDebtPayment(DebtPaymentIntent intent) async {
    try {
      final res = await _supabase.rpc(
        'record_debt_payment',
        params: intent.toRpcParams(),
      );
      return DebtPaymentResult.fromRpc(res);
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

  @override
  Future<List<ActivityItem>> getActivities(
    String storeId, {
    int limit = 50,
  }) async {
    try {
      final res = await _supabase.rpc(
        'shop_activity',
        params: {'p_store_id': storeId, 'p_limit': limit, 'p_offset': 0},
      );

      final events =
          (res as Map<String, dynamic>?)?['events'] as List<dynamic>? ?? [];
      return events
          .map((e) => ActivityItem.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw AppError.fromException(e);
    }
  }
}
