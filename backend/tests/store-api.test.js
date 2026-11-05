import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthService } from '../services/auth-service/app.js';
import { buildGateway } from '../gateway/app.js';
import { createStoreApiHandler } from '../supabase/functions/store-api/index.js';
import { ApiError } from '../shared/errors.js';

const user1 = { id: 'a1000000-0000-4000-8000-000000000001', email: 'user1@example.invalid' };
const user2 = { id: 'a2000000-0000-4000-8000-000000000002', email: 'user2@example.invalid' };
const storeA = {
    id: 's1000000-0000-4000-8000-000000000001',
    name: 'Tạp hóa BIN 1',
    businessType: 'grocery',
    timezone: 'Asia/Ho_Chi_Minh',
    currency: 'VND',
    status: 'active',
    role: 'owner',
    canSell: true,
    canReceiveStock: true,
    canManageDebt: true,
    permissionVersion: 1,
    contactPhone: null,
    address: null,
    settingsVersion: 1,
    createdBy: user1.id,
    createdAt: '2026-09-21T07:00:00+07:00',
    updatedAt: '2026-09-21T07:00:00+07:00',
};

const env = {
    SESSION_SECRET: 'test-only-session-secret-at-least-32-bytes',
    ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:8080',
};

function createMockDeps() {
    const validTokens = new Map([
        ['token-user1', user1],
        ['token-user2', user2],
    ]);

    const identity = {
        verify: async session => {
            const token = session?.accessToken;
            if (!validTokens.has(token)) throw new ApiError('SESSION_EXPIRED', 401);
            return validTokens.get(token);
        },
        client: () => ({
            auth: {
                getUser: async token => {
                    if (validTokens.has(token)) {
                        return { data: { user: validTokens.get(token) }, error: null };
                    }
                    return { data: { user: null }, error: new Error('Invalid token') };
                },
            },
        }),
    };

    const repository = {
        profile: async actorId => ({ accountStatus: 'active', name: actorId === user1.id ? 'User 1' : 'User 2' }),
        stores: async actorId => {
            if (actorId === user1.id) return [storeA];
            return []; // user2 has no stores
        },
        createStore: async () => storeA.id,
    };

    return { identity, repository };
}

// ==========================================
// TEST SUITE 1: Fastify Node / Gateway API
// ==========================================

test('Node Auth Service: GET /api/v1/stores returns 401 when Authorization header is missing', async t => {
    const app = await buildAuthService({ ...createMockDeps(), env, logger: false });
    t.after(() => app.close());

    const result = await app.inject({ method: 'GET', url: '/api/v1/stores' });
    assert.equal(result.statusCode, 401);
    const body = result.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'SESSION_EXPIRED');
});

test('Node Auth Service: GET /api/v1/stores returns 401 when Bearer token is invalid', async t => {
    const app = await buildAuthService({ ...createMockDeps(), env, logger: false });
    t.after(() => app.close());

    const result = await app.inject({
        method: 'GET',
        url: '/api/v1/stores',
        headers: { authorization: 'Bearer invalid-token-xyz' },
    });
    assert.equal(result.statusCode, 401);
    const body = result.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'SESSION_EXPIRED');
});

test('Node Auth Service: GET /api/v1/stores returns 200 with standard envelope for verified user', async t => {
    const app = await buildAuthService({ ...createMockDeps(), env, logger: false });
    t.after(() => app.close());

    const correlationId = 'c1000000-0000-4000-8000-000000000001';
    const result = await app.inject({
        method: 'GET',
        url: '/api/v1/stores',
        headers: {
            authorization: 'Bearer token-user1',
            'x-correlation-id': correlationId,
        },
    });

    assert.equal(result.statusCode, 200);
    const body = result.json();
    assert.equal(body.success, true);
    assert.equal(body.requestId, correlationId);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, storeA.id);
    assert.equal(body.data[0].name, 'Tạp hóa BIN 1');
    assert.equal(body.data[0].permissions.canSell, true);
});

test('Node Auth Service: user with no stores returns 200 with empty array (needs creation)', async t => {
    const app = await buildAuthService({ ...createMockDeps(), env, logger: false });
    t.after(() => app.close());

    const result = await app.inject({
        method: 'GET',
        url: '/api/v1/stores',
        headers: { authorization: 'Bearer token-user2' },
    });

    assert.equal(result.statusCode, 200);
    const body = result.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.data, []);
});

test('Node Gateway forwards Bearer Authorization header to downstream services', async t => {
    const calls = [];
    const app = await buildGateway({
        env,
        logger: false,
        transport: async (url, options) => {
            calls.push({ url, headers: options.headers });
            if (url.includes('/api/v1/auth/me')) {
                return Response.json({ id: user1.id, name: 'User 1' });
            }
            return Response.json({ success: true, data: [storeA] });
        },
    });
    t.after(() => app.close());

    const correlationId = 'c2000000-0000-4000-8000-000000000002';
    const result = await app.inject({
        method: 'GET',
        url: '/api/v1/stores',
        headers: {
            authorization: 'Bearer token-user1',
            'x-correlation-id': correlationId,
        },
    });

    assert.equal(result.statusCode, 200);
    // Since 'stores' maps to auth-service, gateway forwards directly to auth-service (which verifies session itself)
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:8081/api/v1/stores');
    assert.equal(calls[0].headers.authorization, 'Bearer token-user1');
    assert.equal(calls[0].headers['x-correlation-id'], correlationId);
});

test('Database error returns sanitized 500 error envelope without leaking details', async t => {
    const deps = createMockDeps();
    deps.repository.stores = async () => {
        throw new Error('FATAL: connection pool exhausted with internal credentials');
    };

    const app = await buildAuthService({ ...deps, env, logger: false });
    t.after(() => app.close());

    const result = await app.inject({
        method: 'GET',
        url: '/api/v1/stores',
        headers: { authorization: 'Bearer token-user1' },
    });

    assert.equal(result.statusCode, 500);
    const body = result.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'REQUEST_FAILED');
    assert.ok(!result.body.includes('connection pool exhausted'));
    assert.ok(!result.body.includes('internal credentials'));
});

// ==========================================
// TEST SUITE 2: Supabase Edge Function Handler
// ==========================================

test('Edge Function Store API: returns 401 when Authorization header is absent or malformed', async () => {
    const handler = createStoreApiHandler({
        authClientProvider: () => createMockDeps().identity.client(),
        dbClientProvider: () => ({}),
    });

    // Absent header
    const req1 = new Request('https://edge.supabase.co/functions/v1/store-api/stores', { method: 'GET' });
    const res1 = await handler(req1);
    assert.equal(res1.status, 401);
    const body1 = await res1.json();
    assert.equal(body1.success, false);
    assert.equal(body1.error.code, 'SESSION_EXPIRED');

    // Malformed header
    const req2 = new Request('https://edge.supabase.co/functions/v1/store-api/stores', {
        method: 'GET',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });
    const res2 = await handler(req2);
    assert.equal(res2.status, 401);
});

test('Edge Function Store API: returns 200 with canonical DTOs for authorized user', async () => {
    const mockDb = {
        from: table => ({
            select: () => ({
                eq: (f1, v1) => ({
                    maybeSingle: async () => ({ data: { id: v1, account_status: 'active' }, error: null }),
                    eq: () => ({
                        order: () => Promise.resolve({
                            data: [{
                                role: 'owner',
                                is_active: true,
                                can_sell: true,
                                can_receive_stock: true,
                                can_manage_debt: true,
                                permission_version: 1,
                                stores: {
                                    id: storeA.id,
                                    name: 'Tạp hóa BIN 1',
                                    business_type: 'grocery',
                                    timezone: 'Asia/Ho_Chi_Minh',
                                    currency: 'VND',
                                    status: 'active',
                                    contact_phone: null,
                                    address: null,
                                    settings_version: 1,
                                    created_by: user1.id,
                                    created_at: '2026-09-21T07:00:00+07:00',
                                    updated_at: '2026-09-21T07:00:00+07:00',
                                },
                            }],
                            error: null,
                        }),
                    }),
                }),
            }),
        }),
    };

    const correlationId = 'c3000000-0000-4000-8000-000000000003';
    const handler = createStoreApiHandler({
        authClientProvider: () => createMockDeps().identity.client(),
        dbClientProvider: () => mockDb,
    });

    const req = new Request('https://edge.supabase.co/functions/v1/store-api/stores', {
        method: 'GET',
        headers: {
            authorization: 'Bearer token-user1',
            'x-correlation-id': correlationId,
        },
    });

    const res = await handler(req);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-correlation-id'), correlationId);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.requestId, correlationId);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].id, storeA.id);
    assert.equal(body.data[0].name, 'Tạp hóa BIN 1');
    assert.equal(body.data[0].businessType, 'grocery');
    assert.equal(body.data[0].permissions.canSell, true);
});

test('Edge Function Store API: handles OPTIONS CORS preflight', async () => {
    const handler = createStoreApiHandler();
    const req = new Request('https://edge.supabase.co/functions/v1/store-api/stores', {
        method: 'OPTIONS',
        headers: { origin: 'https://tap-hoa-bin.pages.dev' },
    });

    const res = await handler(req);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://tap-hoa-bin.pages.dev');
});
