import { toSafeInteger } from './numberMapper.js';

export function mapStoreMembership(row) {
    const store = row.stores;
    if (!store) throw new Error('Không đọc được cửa hàng của thành viên.');
    return {
        id: store.id,
        name: store.name,
        businessType: store.business_type || 'grocery',
        timezone: store.timezone,
        currency: store.currency,
        status: store.status || 'active',
        createdBy: store.created_by,
        createdAt: store.created_at,
        updatedAt: store.updated_at,
        role: row.role,
        memberActive: row.is_active !== false,
        memberSince: row.created_at,
        phone: store.contact_phone || '', address: store.address || '',
        settingsVersion: toSafeInteger(store.settings_version ?? 1, 'Phiên bản cài đặt', { min: 1 }),
        permissions: { sell: row.role === 'owner' || row.can_sell === true,
            receiveStock: row.role === 'owner' || row.can_receive_stock === true,
            manageDebt: row.role === 'owner' || row.can_manage_debt === true,
            manageShop: row.role === 'owner' },
        permissionVersion: toSafeInteger(row.permission_version ?? 1, 'Phiên bản quyền', { min: 1 }),
    };
}

export const mapStoreMember = row => ({
    storeId: row.store_id, userId: row.user_id, role: row.role,
    isActive: row.is_active !== false, createdAt: row.created_at,
});
