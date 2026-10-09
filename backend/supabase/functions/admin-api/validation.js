import { AdminValidationError } from '../_shared/applicationErrors.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const detailResources = new Set(['shop', 'user', 'shop_members', 'shop_activity', 'shop_security',
  'user_memberships', 'user_activity', 'user_security']);
const resources = new Set(['dashboard', 'shops', 'users', 'admins', 'audit', 'security', 'system', ...detailResources]);
const filters = {
  shops: ['all', 'active', 'suspended', 'archived', 'grocery', 'fruit_shop'],
  users: ['all', 'active', 'disabled', 'owner', 'staff'],
  admins: ['all', 'active', 'disabled'], audit: ['all', 'store', 'user', 'platform_admin'],
};

function textField(value, max, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new AdminValidationError(`${label} chưa hợp lệ.`);
  const text = value.trim();
  if (text.length > max) throw new AdminValidationError(`${label} quá dài.`);
  return text || null;
}

function timestamp(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new AdminValidationError('Mốc thời gian chưa hợp lệ; cần chỉ rõ múi giờ.');
  }
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const instant = new Date(value);
  if (year < 1000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || Number.isNaN(instant.getTime())
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) {
    throw new AdminValidationError('Mốc thời gian chưa hợp lệ.');
  }
  return instant.toISOString();
}

export function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function parseRead(input) {
  if (!resources.has(input?.resource)) throw new AdminValidationError('Mục quản trị không hợp lệ.');
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AdminValidationError('Phân trang chưa hợp lệ.');
  }
  const query = textField(input.query, 120, 'Tìm kiếm');
  const filter = textField(input.filter, 80, 'Bộ lọc');
  if (filter && filters[input.resource] && !filters[input.resource].includes(filter)) throw new AdminValidationError('Bộ lọc chưa hợp lệ.');
  const targetId = input.targetId ?? null;
  if (detailResources.has(input.resource) && !isUuid(targetId)) {
    throw new AdminValidationError('Thiếu mã đối tượng hợp lệ.');
  }
  if (targetId !== null && !isUuid(targetId)) throw new AdminValidationError('Mã đối tượng chưa hợp lệ.');
  const sort = input.sort ?? 'created_desc';
  if (!['created_desc', 'created_asc', 'name_asc', 'name_desc'].includes(sort)
    || (sort.startsWith('name_') && !['shops', 'users', 'admins'].includes(input.resource))) throw new AdminValidationError('Sắp xếp chưa hợp lệ.');
  const businessType = textField(input.businessType, 30, 'Loại cửa hàng');
  if (businessType && (input.resource !== 'shops' || !['grocery', 'fruit_shop'].includes(businessType))) throw new AdminValidationError('Loại cửa hàng chưa hợp lệ.');
  const action = textField(input.action, 80, 'Hành động');
  if (action && input.resource !== 'audit') throw new AdminValidationError('Bộ lọc hành động chưa hợp lệ.');
  const adminId = input.adminId || null;
  const eventUserId = input.eventUserId || null;
  if ((adminId !== null && (input.resource !== 'audit' || !isUuid(adminId)))
    || (eventUserId !== null && (input.resource !== 'security' || !isUuid(eventUserId)))) throw new AdminValidationError('Mã người dùng bộ lọc chưa hợp lệ.');
  const from = timestamp(input.from);
  const to = timestamp(input.to);
  if (from && to && from >= to) throw new AdminValidationError('Khoảng thời gian chưa hợp lệ.');
  if (detailResources.has(input.resource) && (query || (filter && filter !== 'all')
    || from || to || businessType || action || adminId || eventUserId)) throw new AdminValidationError('Bộ lọc chi tiết chưa hợp lệ.');
  return { resource: input.resource, offset, limit, query, filter, targetId,
    sort, businessType, action, adminId, eventUserId, from, to };
}

export function parseAction(input) {
  if (!['store_status', 'user_status', 'admin_status', 'password_reset'].includes(input?.action)) {
    throw new AdminValidationError('Thao tác quản trị không hợp lệ.');
  }
  if (!isUuid(input.targetId) || !isUuid(input.requestId)) {
    throw new AdminValidationError('Mã đối tượng hoặc mã yêu cầu chưa hợp lệ.');
  }
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5
    || input.reason.trim().length > 500) {
    throw new AdminValidationError('Nhập lý do từ 5 đến 500 ký tự.');
  }
  if (input.action === 'store_status' && !['active', 'suspended', 'archived'].includes(input.status)) {
    throw new AdminValidationError('Trạng thái cửa hàng chưa hợp lệ.');
  }
  if (input.action === 'user_status' && !['active', 'disabled'].includes(input.status)) {
    throw new AdminValidationError('Trạng thái tài khoản chưa hợp lệ.');
  }
  if (input.action === 'admin_status' && typeof input.enable !== 'boolean') {
    throw new AdminValidationError('Trạng thái quản trị viên chưa hợp lệ.');
  }
  return { ...input, reason: input.reason.trim() };
}
