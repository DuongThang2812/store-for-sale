import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAction, parseRead } from '../../backend/supabase/functions/admin-api/validation.js';
import { adminDateRange, buildAdminListFilters } from '../src/admin/domain/listFilters.js';
import { createAdminReader } from '../../backend/supabase/functions/admin-api/reads.js';
import { AdminRateLimitError, createAdminActionExecutor } from '../../backend/supabase/functions/admin-api/actions.js';
import { readAuthenticationSummary } from '../../backend/supabase/functions/admin-api/authSummary.js';

const id = '10000000-0000-4000-8000-000000000001';
const requestId = '20000000-0000-4000-8000-000000000001';

test('Admin API accepts only known resources and bounded pagination', () => {
    assert.deepEqual(parseRead({ resource: 'shops', offset: 20, limit: 10 }), {
        resource: 'shops', offset: 20, limit: 10, query: null, filter: null, targetId: null,
        sort: 'created_desc', businessType: null, action: null, adminId: null, eventUserId: null, from: null, to: null,
    });
    assert.throws(() => parseRead({ resource: 'sales' }), /không hợp lệ/);
    assert.throws(() => parseRead({ resource: 'shops', limit: 1000 }), /Phân trang/);
    assert.throws(() => parseRead({ resource: 'shop', targetId: 'not-id' }), /mã đối tượng/);
});

test('Admin list sorting and filters are bounded and cannot carry an SQL sort expression', () => {
    const parsed = parseRead({ resource: 'shops', filter: 'active', businessType: 'fruit_shop', sort: 'name_asc', query: '  BIN  ' });
    assert.equal(parsed.sort, 'name_asc'); assert.equal(parsed.businessType, 'fruit_shop'); assert.equal(parsed.query, 'BIN');
    assert.throws(() => parseRead({ resource: 'shops', sort: 'created_at; drop table stores' }), /Sắp xếp/);
    assert.throws(() => parseRead({ resource: 'audit', sort: 'name_asc' }), /Sắp xếp/);
    assert.throws(() => parseRead({ resource: 'shops', businessType: 'staff' }), /Loại cửa hàng/);
    assert.throws(() => parseRead({ resource: 'users', filter: 'suspended' }), /Bộ lọc/);
    assert.throws(() => parseRead({ resource: 'shops', query: { sql: 'x' } }), /Tìm kiếm/);
    assert.throws(() => parseRead({ resource: 'audit', adminId: 'not-id' }), /Mã người dùng/);
    assert.throws(() => parseRead({ resource: 'security', adminId: id }), /Mã người dùng/);
    assert.equal(parseRead({ resource: 'audit', adminId: id, action: 'SHOP_SUSPENDED' }).adminId, id);
});

test('Admin date filters include the whole Vietnam day and exclude the next day boundary', () => {
    assert.deepEqual(adminDateRange('2026-10-05', '2026-10-05'), { from: '2026-10-04T17:00:00.000Z', to: '2026-10-05T17:00:00.000Z' });
    assert.deepEqual(adminDateRange('2024-02-29', '2024-02-29'), { from: '2024-02-28T17:00:00.000Z', to: '2024-02-29T17:00:00.000Z' });
    assert.deepEqual(adminDateRange('', '2026-12-31'), { from: null, to: '2026-12-31T17:00:00.000Z' });
    assert.throws(() => adminDateRange('2026-02-29', '2026-03-01'), /Ngày lọc/);
    assert.throws(() => adminDateRange('2026-10-06', '2026-10-05'), /Ngày bắt đầu/);
    const range = adminDateRange('2026-10-05', '2026-10-05');
    assert.equal(parseRead({ resource: 'audit', ...range }).from, range.from);
    assert.throws(() => parseRead({ resource: 'audit', from: '2026-10-05' }), /múi giờ/);
    assert.throws(() => parseRead({ resource: 'audit', from: '2026-02-30T00:00:00Z' }), /Mốc thời gian/);
    assert.throws(() => parseRead({ resource: 'audit', from: range.to, to: range.from }), /Khoảng thời gian/);
});

test('Admin UI list filters validate UUID before submission and do not forward calendar drafts', () => {
    const draft = { query: ' BIN ', filter: 'store', sort: 'created_asc', adminId: ` ${id} `, action: 'SHOP_SUSPENDED', fromDate: '2026-10-05', toDate: '2026-10-05' };
    const filters = buildAdminListFilters(draft);
    assert.equal(filters.adminId, id); assert.equal(filters.query, 'BIN'); assert.equal(filters.action, 'SHOP_SUSPENDED');
    assert.equal('fromDate' in filters, false);
    assert.throws(() => buildAdminListFilters({ ...draft, adminId: 'bad-id' }), /UUID/);
});

test('Admin reader forwards date, actor and sort filters to one bounded server RPC', async () => {
    const calls = [];
    const reader = createAdminReader(async (name, params) => { calls.push({ name, params }); return { total: 0, items: [] }; });
    const range = adminDateRange('2026-10-05', '2026-10-05');
    await reader(id, { resource: 'audit', offset: 20, limit: 20, adminId: id, action: 'SHOP_SUSPENDED', filter: 'store', ...range });
    assert.equal(calls[0].name, 'admin_read_filtered');
    assert.equal(calls[0].params.p_admin_id, id);
    assert.equal(calls[0].params.p_actor_id, id);
    assert.equal(calls[0].params.p_action, 'SHOP_SUSPENDED');
    assert.equal(calls[0].params.p_from, '2026-10-04T17:00:00.000Z');
    assert.equal(calls[0].params.p_to, '2026-10-05T17:00:00.000Z');
    assert.equal(calls[0].params.p_offset, 20);
    await assert.rejects(reader(id, { resource: 'audit', sort: 'name_asc' }), /Sắp xếp/);
    assert.equal(calls.length, 1);
});

test('Admin mutations require request ID, reason and restricted status', () => {
    assert.equal(parseAction({ action: 'store_status', targetId: id, requestId, reason: '  Có yêu cầu  ', status: 'suspended' }).reason, 'Có yêu cầu');
    assert.throws(() => parseAction({ action: 'store_status', targetId: id, requestId, reason: 'ngắn', status: 'suspended' }), /lý do/);
    assert.throws(() => parseAction({ action: 'store_status', targetId: id, requestId, reason: 'Có lý do', status: 'deleted' }), /Trạng thái/);
    assert.throws(() => parseAction({ action: 'admin_status', targetId: id, requestId, reason: 'Có lý do', enable: 'yes' }), /Trạng thái/);
});

const mutation = { action: 'store_status', targetId: id, requestId, reason: '  Có yêu cầu  ', status: 'suspended' };
test('Admin admission runs before mutation and preserves canonical intent and retry ID', async () => {
    const order = [];
    const executor = createAdminActionExecutor(async (name, params) => {
        order.push('admit'); assert.equal(name, 'admin_admit_action');
        assert.deepEqual(params, { p_actor_id: id, p_request_id: requestId, p_action: 'store_status',
            p_target_id: id, p_reason: 'Có yêu cầu', p_status: 'suspended', p_enable: null });
        return { allowed: true, duplicate: order.length > 1 };
    }, async (actor, action) => { order.push('mutate'); assert.equal(actor, id); return action.requestId; });
    assert.equal(await executor(id, { ...mutation, enable: true, injected: 'ignored' }), requestId);
    assert.equal(await executor(id, mutation), requestId);
    assert.deepEqual(order, ['admit', 'mutate', 'admit', 'mutate']);
});

test('Admin denial reports a bounded cooldown and never reaches business or Auth execution', async () => {
    let writes = 0;
    const executor = createAdminActionExecutor(async () => ({ allowed: false, retry_after: 23 }), () => { writes++; });
    await assert.rejects(executor(id, mutation), error => error instanceof AdminRateLimitError && error.retryAfter === 23);
    assert.equal(writes, 0);
});

test('Admin admission fails closed for unavailable and malformed server responses', async () => {
    let writes = 0;
    for (const response of [null, {}, { allowed: 'true' }, { allowed: false, retry_after: 0 }, { allowed: false, retry_after: 61 }]) {
        const executor = createAdminActionExecutor(async () => response, () => { writes++; });
        await assert.rejects(executor(id, mutation), /Chưa kiểm tra/);
    }
    const unavailable = createAdminActionExecutor(async () => { throw new Error('Database unavailable'); }, () => { writes++; });
    await assert.rejects(unavailable(id, mutation), /Database unavailable/);
    assert.equal(writes, 0);
});

test('Invalid Admin input is rejected before consuming admission or executing writes', async () => {
    let calls = 0;
    const executor = createAdminActionExecutor(async () => { calls++; }, () => { calls++; });
    await assert.rejects(executor(id, { ...mutation, requestId: 'bad-id' }), /chưa hợp lệ/);
    assert.equal(calls, 0);
});

test('Admin detail resources require a target and never accept unsupported global filters', () => {
    for (const resource of ['shop_members', 'shop_activity', 'shop_security', 'user_memberships', 'user_activity', 'user_security']) {
        assert.equal(parseRead({ resource, targetId: id, offset: 20 }).targetId, id);
        assert.throws(() => parseRead({ resource }), /mã đối tượng/);
        assert.throws(() => parseRead({ resource, targetId: id, query: 'ignored' }), /Bộ lọc chi tiết/);
        assert.throws(() => parseRead({ resource, targetId: id, sort: 'name_asc' }), /Sắp xếp/);
    }
});

test('Admin detail reader sends one target-scoped bounded RPC and does not call Auth for lists', async () => {
    let authCalls = 0;
    const calls = [];
    const reader = createAdminReader(async (name, params) => { calls.push({ name, params }); return { total: 0, items: [] }; },
        async () => { authCalls++; });
    await reader(id, { resource: 'shop_members', targetId: id, offset: 20, limit: 20 });
    assert.deepEqual(calls[0], { name: 'admin_read_detail', params: { p_actor_id: id,
        p_resource: 'shop_members', p_target_id: id, p_offset: 20, p_limit: 20, p_sort: 'created_desc' } });
    assert.equal(authCalls, 0);
});

test('Authentication summary includes only provider confirmation and sign-in timestamps', async () => {
    const summary = await readAuthenticationSummary(async targetId => ({ data: { user: { id: targetId,
        email_confirmed_at: '2026-10-01T10:00:00Z', last_sign_in_at: '2026-10-05T11:00:00Z',
        encrypted_password: 'never expose', identities: [{ secret: true }], user_metadata: { phone: 'private' },
        app_metadata: { role: 'private' }, factors: [{ secret: true }] } } }), id);
    assert.deepEqual(summary, { available: true, email_confirmed_at: '2026-10-01T10:00:00.000Z', last_sign_in_at: '2026-10-05T11:00:00.000Z' });
    assert.deepEqual(await readAuthenticationSummary(async () => { throw new Error('Auth unreachable'); }, id), { available: false });
    assert.deepEqual(await readAuthenticationSummary(async () => ({ error: new Error('denied') }), id), { available: false });
    assert.deepEqual(await readAuthenticationSummary(async () => ({ data: { user: { id: requestId } } }), id), { available: false });
});

test('User detail augments DB metadata with sanitized Auth summary, but missing user never calls Auth', async () => {
    let authCalls = 0;
    const readAuth = async targetId => { authCalls++; return { data: { user: { id: targetId, email_confirmed_at: null, last_sign_in_at: null } } }; };
    const reader = createAdminReader(async () => ({ id, email: 'test@example.invalid' }), readAuth);
    const data = await reader(id, { resource: 'user', targetId: id });
    assert.equal(data.email, 'test@example.invalid');
    assert.deepEqual(data.authentication_summary, { available: true, email_confirmed_at: null, last_sign_in_at: null });
    const missing = createAdminReader(async () => null, readAuth);
    assert.equal(await missing(id, { resource: 'user', targetId: id }), null);
    assert.equal(authCalls, 1);
});
