import { getSupabaseClient } from '../lib/supabase.js';
import { mapStockCommand } from '../mappers/transactionMapper.js';
import { requireUuid, unwrap } from './serviceUtils.js';
import { toSafeInteger } from '../mappers/numberMapper.js';
import { mapStockCsvRows } from '../mappers/stockCsvMapper.js';

const adjustmentReasons = new Set(['damaged', 'spoiled', 'lost', 'inventory_correction', 'personal_use', 'other']);

export function createInventoryService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        receiveStock(storeId, command) {
            const params = mapStockCommand(storeId, command);
            if (command.supplierId != null) params.p_supplier_id = requireUuid(command.supplierId, 'Nhà cung cấp');
            return unwrap(clientProvider().rpc('receive_stock', params));
        },
        importCsv(storeId, { requestId, rows, products }) {
            return unwrap(clientProvider().rpc('import_stock_csv', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_rows: mapStockCsvRows(storeId, rows, products),
            }));
        },
        adjustStock(storeId, { requestId, productId, quantityBase, reason, note = null }) {
            if (typeof quantityBase !== 'number' || !Number.isSafeInteger(quantityBase) || quantityBase === 0) throw new Error('Số lượng điều chỉnh chưa hợp lệ.');
            if (!adjustmentReasons.has(reason)) throw new Error('Lý do điều chỉnh chưa hợp lệ.');
            if (note != null && (typeof note !== 'string' || note.length > 500)) throw new Error('Ghi chú điều chỉnh quá dài.');
            return unwrap(clientProvider().rpc('adjust_stock', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_product_id: requireUuid(productId, 'Mặt hàng'),
                p_quantity_base: toSafeInteger(Math.abs(quantityBase), 'Số lượng điều chỉnh', { min: 1 }) * Math.sign(quantityBase),
                p_reason: reason,
                p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_note: note?.trim() || null,
            }));
        },
        countStock(storeId, { requestId, items, note = null }) {
            if (!Array.isArray(items) || items.length < 1 || items.length > 500) {
                throw new Error('Danh sách kiểm kê phải có từ 1 đến 500 mặt hàng.');
            }
            const mapped = items.map(item => ({
                product_id: requireUuid(item.productId, 'Mặt hàng'),
                actual_base: toSafeInteger(item.actualBase, 'Tồn thực tế'),
                reason: item.reason?.trim() || null,
                expected_version: toSafeInteger(item.expectedVersion, 'Phiên bản mặt hàng', { min: 1 }),
            }));
            if (new Set(mapped.map(item => item.product_id)).size !== mapped.length) {
                throw new Error('Mặt hàng kiểm kê bị lặp.');
            }
            if (note != null && (typeof note !== 'string' || note.length > 500)) {
                throw new Error('Ghi chú kiểm kê quá dài.');
            }
            return unwrap(clientProvider().rpc('record_inventory_count_reviewed', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_items: mapped, p_note: note?.trim() || null,
            }));
        },
        productCost(storeId, productId) {
            return unwrap(clientProvider().rpc('inventory_product_cost', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'), p_product_id: requireUuid(productId, 'Mặt hàng'),
            }));
        },
        valueOpeningStock(storeId, { requestId, productId, unitKey, costPerUnit }) {
            if (typeof unitKey !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(unitKey)) {
                throw new Error('Đơn vị định giá chưa hợp lệ.');
            }
            return unwrap(clientProvider().rpc('value_opening_stock', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_product_id: requireUuid(productId, 'Mặt hàng'),
                p_unit_key: unitKey,
                p_cost_per_unit: toSafeInteger(costPerUnit, 'Giá vốn'),
                p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
            }));
        },
    });
}

export const inventoryService = createInventoryService();
