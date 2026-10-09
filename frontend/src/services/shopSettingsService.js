import { getSupabaseClient } from '../lib/supabase.js';
import { requireUuid, requiredText, unwrap } from './serviceUtils.js';
import { toSafeInteger } from '../mappers/numberMapper.js';

export function createShopSettingsService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        listStaff(storeId, { offset = 0, limit = 30 } = {}) {
            if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Phân trang chưa hợp lệ.');
            return unwrap(clientProvider().rpc('list_store_staff', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'), p_offset: offset, p_limit: limit,
            }));
        },
        saveStaff(storeId, { requestId, email = null, userId = null, expectedVersion = null,
            canSell = true, canReceiveStock = false, canManageDebt = false, isActive = true }) {
            const booleans = [canSell, canReceiveStock, canManageDebt, isActive];
            if (booleans.some(value => typeof value !== 'boolean')) throw new Error('Quyền nhân viên chưa hợp lệ.');
            const normalizedEmail = userId ? null : requiredText(email, 'Email').toLowerCase();
            if (normalizedEmail && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254)) throw new Error('Email chưa hợp lệ.');
            return unwrap(clientProvider().rpc('save_store_staff', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'), p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_email: normalizedEmail, p_user_id: userId ? requireUuid(userId, 'Nhân viên') : null,
                p_expected_version: userId ? toSafeInteger(expectedVersion, 'Phiên bản quyền', { min: 1 }) : null,
                p_can_sell: canSell, p_can_receive_stock: canReceiveStock, p_can_manage_debt: canManageDebt,
                p_is_active: isActive,
            }));
        },
        saveSettings(storeId, { requestId, name, phone = '', address = '', expectedVersion }) {
            const normalizedName = requiredText(name, 'Tên cửa hàng');
            if (normalizedName.length > 120 || typeof phone !== 'string' || phone.length > 30
                || typeof address !== 'string' || address.length > 300) throw new Error('Thông tin cửa hàng chưa hợp lệ.');
            return unwrap(clientProvider().rpc('save_store_settings', {
                p_store_id: requireUuid(storeId, 'Cửa hàng'), p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_name: normalizedName, p_contact_phone: phone.trim() || null, p_address: address.trim() || null,
                p_expected_version: toSafeInteger(expectedVersion, 'Phiên bản cài đặt', { min: 1 }),
            }));
        },
    });
}
export const shopSettingsService = createShopSettingsService();
