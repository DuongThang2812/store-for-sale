import { getSupabaseClient } from '../lib/supabase.js';
import { requireUuid, unwrap } from './serviceUtils.js';
import { mapActivityEvent } from '../mappers/activityMapper.js';

export function createActivityService(clientProvider = getSupabaseClient) {
    async function page(storeId, { offset = 0, limit = 50, kind = null, customerId = null, productId = null } = {}) {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new Error('Phân trang lịch sử chưa hợp lệ.');
        }
        const result = await unwrap(clientProvider().rpc('shop_activity', {
            p_store_id: requireUuid(storeId, 'Cửa hàng'), p_offset: offset, p_limit: limit,
            p_kind: kind, p_customer_id: customerId ? requireUuid(customerId, 'Khách') : null,
            p_product_id: productId ? requireUuid(productId, 'Mặt hàng') : null,
        }));
        return { entries: result.events.map(mapActivityEvent), hasMore: result.has_more, nextOffset: result.next_offset };
    }
    return Object.freeze({ page, async list(storeId) { return (await page(storeId)).entries; } });
}
export const activityService = createActivityService();
