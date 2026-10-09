import { getSupabaseClient } from '../lib/supabase.js';
import { mapReport, mapDashboard } from '../mappers/reportMapper.js';
import { requireUuid, unwrap } from './serviceUtils.js';

const periods = new Set([1, 7, 30, 90]);
export function createReportService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        async getRevenue(storeId, days = 7) {
            if (!periods.has(days)) throw new Error('Chọn 1, 7, 30 hoặc 90 ngày để xem báo cáo.');
            requireUuid(storeId, 'Cửa hàng');
            const result = await unwrap(clientProvider().rpc('management_report', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'), p_days: days,
            }));
            return mapReport(result);
        },
        async getDashboard(storeId) {
            requireUuid(storeId, 'Cửa hàng');
            return mapDashboard(await unwrap(clientProvider().rpc('shop_dashboard', { p_store_id: storeId })));
        },
    });
}

export const reportService = createReportService();
