import test from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationError, AdminValidationError, ERROR_MESSAGES, toApplicationError,
    publicErrorBody, fromAdminResponse } from '../../backend/supabase/functions/_shared/applicationErrors.js';
import { unwrap } from '../src/services/serviceUtils.js';
import { createAdminApi } from '../src/admin/services/adminApi.js';
import { parseAction, parseRead } from '../../backend/supabase/functions/admin-api/validation.js';
import { createRequestJournal } from '../src/services/requestJournal.js';
import { createCloudCommandRunner } from '../src/services/cloudCommandRunner.js';

const secret = 'private.sale_items SQL SELECT credential=SECRET';

test('service boundaries hide provider diagnostics while preserving code and cause', async () => {
    const source = { code: '42501', message: secret, details: secret, hint: secret };
    await assert.rejects(unwrap(Promise.resolve({ data: null, error: source })), error => {
        assert.equal(error.message, ERROR_MESSAGES.FORBIDDEN);
        assert.equal(error.applicationCode, 'FORBIDDEN');
        assert.equal(error.code, source.code);
        assert.equal(error.cause, source);
        assert.equal(JSON.stringify(error).includes(secret), false);
        return true;
    });
    const data = { rows: [1] };
    assert.equal(await unwrap(Promise.resolve({ data, error: null })), data);
});

test('SQL, auth, network and unknown failures have local public messages', () => {
    for (const [code, applicationCode] of [
        ['23505', 'DATA_CHANGED'], ['40001', 'DATA_CHANGED'], ['40P01', 'DATA_CHANGED'],
        ['22P02', 'INVALID_REQUEST'], ['22003', 'INVALID_REQUEST'], ['23503', 'INVALID_REQUEST'],
        ['PGRST301', 'SESSION_EXPIRED'], ['08006', 'CONNECTION_FAILED'],
        ['P0001', 'REQUEST_FAILED'], ['unknown', 'REQUEST_FAILED'],
    ]) {
        const error = toApplicationError({ code, message: secret, details: secret });
        assert.equal(error.applicationCode, applicationCode);
        assert.equal(error.message.includes(secret), false);
        assert.equal(JSON.stringify(publicErrorBody(error)).includes(secret), false);
    }
    assert.equal(toApplicationError(new TypeError(secret)).applicationCode, 'CONNECTION_FAILED');
});

test('business errors discard dynamic product names and retain actionable categories', () => {
    for (const [message, applicationCode] of [
        [`Không đủ hàng ${secret}\n<script> trong kho.`, 'INSUFFICIENT_STOCK'],
        ['Số tiền trả vượt quá số nợ hiện tại.', 'DEBT_OVERPAYMENT'],
        ['Giá hoặc tồn kho đã thay đổi. Hãy tải lại giỏ hàng và xác nhận số tiền mới.', 'DATA_CHANGED'],
        ['Mặt hàng đã thay đổi. Hãy tải lại thông tin trước khi lưu.', 'DATA_CHANGED'],
        ['Số tiền hoàn hoặc công nợ đã thay đổi. Hãy mở lại xác nhận hủy đơn.', 'DATA_CHANGED'],
        ['Mã yêu cầu đã được dùng cho đơn bán khác.', 'REQUEST_ID_CONFLICT'],
        ['Không thể vô hiệu quản trị viên cuối cùng.', 'LAST_ADMIN'],
        ['Mặt hàng đã có lịch sử kho; không thể đổi đơn vị nhỏ nhất. Hãy tạo mặt hàng mới.', 'UNIT_LOCKED'],
    ]) {
        const error = toApplicationError({ code: 'P0001', message });
        assert.equal(error.applicationCode, applicationCode);
        assert.equal(error.message, ERROR_MESSAGES[applicationCode]);
        assert.equal(error.message.includes(secret), false);
    }
    // Similar-looking provider text with a different SQL code is not a business error.
    assert.equal(toApplicationError({ code: 'XX000', message: 'Không đủ hàng secret trong kho.' }).applicationCode, 'REQUEST_FAILED');
});

test('Edge validation and JSON syntax errors cannot leak raw messages', () => {
    for (const error of [new SyntaxError(secret), new AdminValidationError(secret)]) {
        assert.deepEqual(publicErrorBody(error), { status: 400, body: {
            code: 'INVALID_REQUEST', error: ERROR_MESSAGES.INVALID_REQUEST,
        } });
    }
    // The former keyword regex accepted arbitrary diagnostics; it must not do so.
    const spoof = { name: 'AdminValidationError', message: `${secret} chưa hợp lệ` };
    assert.equal(publicErrorBody(spoof).status, 500);
    assert.equal(JSON.stringify(publicErrorBody(spoof)).includes(secret), false);
    assert.throws(() => parseRead({ resource: 'secret' }), AdminValidationError);
    assert.throws(() => parseAction({ action: 'secret' }), AdminValidationError);
});

test('Edge maps permissions and known Admin business failures to safe public codes', () => {
    assert.equal(publicErrorBody({ code: '42501', message: secret }).status, 403);
    assert.deepEqual(publicErrorBody({ code: 'P0001', message: 'Không thể vô hiệu quản trị viên cuối cùng.' }), {
        status: 400, body: { code: 'LAST_ADMIN', error: ERROR_MESSAGES.LAST_ADMIN },
    });
    const known = new ApplicationError('EMAIL_PENDING');
    assert.equal(toApplicationError(known), known);
    assert.equal(publicErrorBody(known).body.code, 'EMAIL_PENDING');
});

test('Admin client rejects untrusted messages, prototype keys and malformed public codes', () => {
    for (const code of ['unrecognized', '__proto__', 'constructor', { toString: 'secret' }, null]) {
        const error = fromAdminResponse({ code, error: secret }, 400);
        assert.equal(error.message, ERROR_MESSAGES.INVALID_REQUEST);
    }
    assert.equal(new ApplicationError('__proto__').message, ERROR_MESSAGES.REQUEST_FAILED);
    assert.equal(fromAdminResponse({ code: 'LAST_ADMIN', error: secret }, 400).message, ERROR_MESSAGES.LAST_ADMIN);
    assert.equal(fromAdminResponse({ error: secret }, 500).message, ERROR_MESSAGES.REQUEST_FAILED);
});

test('rate limit metadata remains bounded and public text is local', () => {
    const error = fromAdminResponse({ code: 'RATE_LIMITED', error: secret, retryAfter: 23 }, 429);
    assert.equal(error.retryAfter, 23);
    assert.equal(error.status, 429);
    assert.equal(error.message, 'Bạn thao tác quá nhanh. Vui lòng chờ 23 giây rồi thử lại.');
    for (const retryAfter of [-1, 0, 61, '23', 1.5]) {
        assert.equal(fromAdminResponse({ retryAfter }, 429).retryAfter, null);
    }
    assert.equal(fromAdminResponse({ retryAfter: 10 }, 400).retryAfter, null);
});

test('public HTTP status follows application semantics rather than provider status', () => {
    assert.equal(publicErrorBody({ code: '42501', status: 400, message: secret }).status, 403);
    assert.equal(publicErrorBody({ code: '40001', status: 500, message: secret }).status, 409);
    assert.equal(publicErrorBody({ code: 'P0001', status: 400,
        message: 'Mã yêu cầu đã được dùng cho đơn bán khác.' }).status, 409);
    assert.equal(new ApplicationError('RATE_LIMITED', { retryAfter: 1000 }).retryAfter, null);
});

test('Admin API parses HTTP error context without consuming it or showing its diagnostics', async () => {
    const response = new Response(JSON.stringify({ code: 'LAST_ADMIN', error: secret }), { status: 400 });
    const source = { context: response, message: secret };
    const api = createAdminApi(() => ({ functions: { invoke: async () => ({ data: null, error: source }) } }));
    await assert.rejects(api.read('users'), error => error.cause === source && error.applicationCode === 'LAST_ADMIN');
    assert.equal(response.bodyUsed, false);
    const invalid = createAdminApi(() => ({ functions: { invoke: async () => ({ data: null,
        error: { context: new Response(secret, { status: 502 }), message: secret } }) } }));
    await assert.rejects(invalid.status(), error => error.message === ERROR_MESSAGES.REQUEST_FAILED);
});

test('both rejected requests and SDK error results use the safe boundary', async () => {
    await assert.rejects(unwrap(Promise.reject(new TypeError(secret))), error => error.applicationCode === 'CONNECTION_FAILED');
    const api = createAdminApi(() => ({ functions: { invoke: async () => { throw new TypeError(secret); } } }));
    await assert.rejects(api.status(), error => error.applicationCode === 'CONNECTION_FAILED');
    const success = createAdminApi(() => ({ functions: { invoke: async () => ({ data: { data: [1] }, error: null }) } }));
    assert.deepEqual(await success.read('users'), [1]);
});

test('safe post-commit reload failure keeps the same idempotency ID for a retry', async () => {
    const rows = new Map();
    const storage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
    const context = () => ({ actorId: 'owner', storeId: 'shop', scope: 1 });
    const run = createCloudCommandRunner({ context, journal: createRequestJournal(storage) });
    const ids = [];
    const perform = async id => { ids.push(id); return { saleId: 'committed' }; };
    await assert.rejects(run('shop', 'sale', { units: 1 }, perform,
        () => unwrap(Promise.resolve({ error: { code: '08006', message: secret } }))), error => error.applicationCode === 'CONNECTION_FAILED');
    assert.equal((await run('shop', 'sale', { units: 1 }, perform, async () => {})).saleId, 'committed');
    assert.equal(ids[0], ids[1]);
    await run('shop', 'sale', { units: 1 }, perform, async () => {});
    assert.notEqual(ids[1], ids[2]);
});
