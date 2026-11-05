/**
 * Maps raw database store records to the shared API contract DTO.
 * Used by both React Web adapter and Flutter Dart clients.
 */
export function mapStoreDto(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        businessType: row.businessType || 'grocery',
        timezone: row.timezone || 'Asia/Ho_Chi_Minh',
        currency: row.currency || 'VND',
        status: row.status || 'active',
        role: row.role || 'owner',
        permissions: {
            canSell: Boolean(row.canSell ?? (row.role === 'owner')),
            canReceiveStock: Boolean(row.canReceiveStock ?? (row.role === 'owner')),
            canManageDebt: Boolean(row.canManageDebt ?? (row.role === 'owner')),
            permissionVersion: Number(row.permissionVersion || 1),
        },
        contactPhone: row.contactPhone ?? null,
        address: row.address ?? null,
        settingsVersion: Number(row.settingsVersion || 1),
        createdBy: row.createdBy,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
    };
}
