export const adminActions = ['SHOP_SUSPENDED', 'SHOP_RESTORED', 'SHOP_ARCHIVED',
    'USER_DISABLED', 'USER_ENABLED', 'ADMIN_GRANTED', 'ADMIN_DISABLED', 'ADMIN_REACTIVATED', 'PASSWORD_RESET_REQUESTED'];
export const adminSecurityEvents = [...adminActions, 'ADMIN_RATE_LIMITED'];

function startOfDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày lọc chưa hợp lệ.');
    const [year, month, day] = value.split('-').map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
        throw new Error('Ngày lọc chưa hợp lệ.');
    }
    return new Date(`${value}T00:00:00+07:00`).getTime();
}

/** UI end date is inclusive; SQL upper bound is exclusive. Vietnam has no DST. */
export function adminDateRange(fromDate = '', toDate = '') {
    const from = fromDate ? startOfDay(fromDate) : null;
    const end = toDate ? startOfDay(toDate) : null;
    if (from !== null && end !== null && from > end) throw new Error('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
    return { from: from === null ? null : new Date(from).toISOString(),
        to: end === null ? null : new Date(end + 86400000).toISOString() };
}

export function buildAdminListFilters(draft) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const adminId = draft.adminId?.trim() || null;
    const eventUserId = draft.eventUserId?.trim() || null;
    if ((adminId && !uuid.test(adminId)) || (eventUserId && !uuid.test(eventUserId))) throw new Error('Mã người dùng cần là UUID hợp lệ.');
    return { query: draft.query.trim(), filter: draft.filter, sort: draft.sort,
        businessType: draft.businessType || null, adminId, eventUserId, action: draft.action || null,
        ...adminDateRange(draft.fromDate, draft.toDate) };
}
