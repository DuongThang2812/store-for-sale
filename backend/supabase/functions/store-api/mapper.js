/**
 * Maps PostgreSQL store & membership records to canonical Store DTO
 * for the shared API contract (React Web + Flutter).
 */
export function mapStoreDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    businessType: row.businessType || row.business_type || 'grocery',
    timezone: row.timezone || 'Asia/Ho_Chi_Minh',
    currency: row.currency || 'VND',
    status: row.status || 'active',
    role: row.role || 'owner',
    permissions: {
      canSell: Boolean(row.canSell ?? (row.can_sell !== undefined ? row.can_sell : row.role === 'owner')),
      canReceiveStock: Boolean(row.canReceiveStock ?? (row.can_receive_stock !== undefined ? row.can_receive_stock : row.role === 'owner')),
      canManageDebt: Boolean(row.canManageDebt ?? (row.can_manage_debt !== undefined ? row.can_manage_debt : row.role === 'owner')),
      permissionVersion: Number(row.permissionVersion || row.permission_version || 1),
    },
    contactPhone: row.contactPhone ?? row.contact_phone ?? null,
    address: row.address ?? null,
    settingsVersion: Number(row.settingsVersion || row.settings_version || 1),
    createdBy: row.createdBy || row.created_by,
    createdAt: row.createdAt || row.created_at ? new Date(row.createdAt || row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updatedAt || row.updated_at ? new Date(row.updatedAt || row.updated_at).toISOString() : new Date().toISOString(),
  };
}
