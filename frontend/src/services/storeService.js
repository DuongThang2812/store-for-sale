import { getSupabaseClient } from '../lib/supabase.js';
import { createAuthService } from './authService.js';
import { mapStoreMember, mapStoreMembership } from '../mappers/storeMapper.js';
import { requiredText, requireUuid, unwrap } from './serviceUtils.js';
import { requireBusinessType } from '../domain/businessTypes.js';

const membershipFields = 'store_id,user_id,role,is_active,can_sell,can_receive_stock,can_manage_debt,permission_version,created_at,stores!inner(id,name,business_type,timezone,currency,status,contact_phone,address,settings_version,created_by,created_at,updated_at)';

export function createStoreService(clientProvider = getSupabaseClient) {
    const auth = createAuthService(clientProvider);
    const requireUser = async () => {
        const user = await auth.getUser();
        if (!user) throw new Error('Vui lòng đăng nhập trước khi chọn cửa hàng.');
        return user;
    };
    const service = {
        async getProfile(confirmedUser = null) {
            const user = confirmedUser ?? await requireUser();
            const row = await unwrap(clientProvider().from('profiles').select('id,display_name,account_status')
                .eq('id', user.id).maybeSingle());
            if (!row || row.account_status !== 'active') {
                throw new Error('Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.');
            }
            return { id: user.id, name: row?.display_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Chủ tiệm' };
        },
        async listStores(confirmedUser = null) {
            const user = confirmedUser ?? await requireUser();
            const rows = await unwrap(clientProvider().from('store_members').select(membershipFields)
                .eq('user_id', user.id).eq('is_active', true).order('created_at').order('store_id'));
            return rows.map(mapStoreMembership);
        },
        async getStore(storeId) {
            requireUuid(storeId, 'Cửa hàng');
            const user = await requireUser();
            const row = await unwrap(clientProvider().from('store_members').select(membershipFields)
                .eq('user_id', user.id).eq('store_id', storeId).eq('is_active', true).maybeSingle());
            if (!row) throw new Error('Cửa hàng không tồn tại hoặc bạn không có quyền truy cập.');
            return mapStoreMembership(row);
        },
        async listMembers(storeId) {
            await service.getStore(storeId);
            const rows = await unwrap(clientProvider().from('store_members').select('store_id,user_id,role,is_active,created_at')
                .eq('store_id', storeId).order('created_at').order('user_id'));
            return rows.map(mapStoreMember);
        },
        async hasCompletedLegacyImport(storeId) {
            await service.getStore(storeId);
            const row = await unwrap(clientProvider().from('legacy_import_batches')
                .select('id,status').eq('store_id', storeId).eq('status', 'completed').maybeSingle());
            return !!row;
        },
        async createStore(name, businessType = 'grocery') {
            await requireUser();
            const normalized = requiredText(name, 'Tên cửa hàng');
            if (normalized.length > 120) throw new Error('Tên cửa hàng tối đa 120 ký tự.');
            const storeId = await unwrap(clientProvider().rpc('create_store', { p_name: normalized, p_business_type: requireBusinessType(businessType) }));
            // Return the committed ID even if the subsequent read/network is unavailable.
            // The caller should load getStore(storeId); never retry create_store blindly.
            return storeId;
        },
        async loadContext(preferredStoreId = null, confirmedUser = null) {
            const stores = await service.listStores(confirmedUser);
            const store = preferredStoreId
                ? stores.find(item => item.id === preferredStoreId) ?? null
                : stores.length === 1 ? stores[0] : null;
            return { stores, store, needsStoreCreation: stores.length === 0, needsStoreSelection: stores.length > 0 && !store };
        },
    };
    return Object.freeze(service);
}

export const storeService = createStoreService();
