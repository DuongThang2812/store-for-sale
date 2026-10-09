import { getSupabaseClient } from '../lib/supabase.js';
import { mapSaleCommand } from '../mappers/transactionMapper.js';
import { requireUuid, unwrap } from './serviceUtils.js';

export function createSalesService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        createSale(storeId, command) {
            // Caller keeps the SAME requestId and payload for retries of one sale.
            const params = mapSaleCommand(storeId, command);
            if (command.items.some(item => item.expectedVersion !== undefined)) {
                params.p_items = params.p_items.map((item, index) => {
                    const expectedVersion = command.items[index].expectedVersion;
                    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new Error('Phiên bản mặt hàng chưa hợp lệ.');
                    return { ...item, expected_version: expectedVersion };
                });
                return unwrap(clientProvider().rpc('create_sale_reviewed', params));
            }
            return unwrap(clientProvider().rpc('create_sale', params));
        },
        previewCancellation(storeId, saleId) {
            return unwrap(clientProvider().rpc('preview_sale_cancellation', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_sale_id: requireUuid(saleId, 'Đơn bán'),
            }));
        },
        cancelSale(storeId, { saleId, reason, requestId, previewToken }) {
            if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 300) {
                throw new Error('Lý do hủy phải có từ 1 đến 300 ký tự.');
            }
            if (typeof previewToken !== 'string' || !/^[0-9a-f]{64}$/.test(previewToken)) {
                throw new Error('Hãy mở lại thông tin xác nhận hủy đơn.');
            }
            return unwrap(clientProvider().rpc('cancel_sale_confirmed', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'),
                p_sale_id: requireUuid(saleId, 'Đơn bán'), p_reason: reason.trim(),
                p_request_id: requireUuid(requestId, 'Mã yêu cầu'), p_preview_token: previewToken,
            }));
        },
    });
}

export const salesService = createSalesService();
