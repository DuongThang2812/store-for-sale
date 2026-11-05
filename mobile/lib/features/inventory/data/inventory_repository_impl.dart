import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/errors/app_error.dart';
import '../domain/inventory_models.dart';
import '../domain/inventory_repository.dart';

/// Triển khai thực tế của InventoryRepository giao tiếp trực tiếp với Supabase PostgreSQL RPCs
/// - `receive_stock`
/// - `adjust_stock`
/// - `record_inventory_count_reviewed`
/// - `save_category`
/// - `save_supplier`
class InventoryRepositoryImpl implements InventoryRepository {
  final SupabaseClient _supabase;

  InventoryRepositoryImpl({required SupabaseClient supabaseClient})
    : _supabase = supabaseClient;

  @override
  Future<ReceiveStockResult> receiveStock(ReceiveStockIntent intent) async {
    try {
      final res = await _supabase.rpc(
        'receive_stock',
        params: intent.toRpcParams(),
      );
      return ReceiveStockResult.fromRpc(res);
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
  Future<AdjustStockResult> adjustStock(AdjustStockIntent intent) async {
    try {
      final res = await _supabase.rpc(
        'adjust_stock',
        params: intent.toRpcParams(),
      );
      return AdjustStockResult.fromRpc(res);
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
  Future<InventoryCountResult> countStock(InventoryCountIntent intent) async {
    try {
      final res = await _supabase.rpc(
        'record_inventory_count_reviewed',
        params: intent.toRpcParams(),
      );
      return InventoryCountResult.fromRpc(res);
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
  Future<List<CategoryItem>> getCategories(String storeId) async {
    try {
      final rows = await _supabase
          .from('categories')
          .select()
          .eq('store_id', storeId)
          .order('name');
      return (rows as List<dynamic>)
          .map((r) => CategoryItem.fromJson(r as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<CategoryItem> saveCategory(String storeId, String name) async {
    try {
      final res = await _supabase.rpc(
        'save_category',
        params: {'p_store_id': storeId, 'p_name': name.trim()},
      );
      final id = res is String
          ? res
          : (res as Map<String, dynamic>)['id'] as String? ?? '';
      return CategoryItem(id: id, name: name.trim());
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
  Future<List<SupplierItem>> getSuppliers(String storeId) async {
    try {
      final rows = await _supabase
          .from('suppliers')
          .select()
          .eq('store_id', storeId)
          .order('name');
      return (rows as List<dynamic>)
          .map((r) => SupplierItem.fromJson(r as Map<String, dynamic>))
          .toList();
    } catch (e) {
      throw AppError.fromException(e);
    }
  }

  @override
  Future<SupplierItem> saveSupplier(
    String storeId,
    String name, {
    String? phone,
  }) async {
    try {
      final res = await _supabase.rpc(
        'save_supplier',
        params: {
          'p_store_id': storeId,
          'p_name': name.trim(),
          'p_phone': phone?.trim(),
        },
      );
      final id = res is String
          ? res
          : (res as Map<String, dynamic>)['id'] as String? ?? '';
      return SupplierItem(id: id, name: name.trim(), phone: phone?.trim());
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
