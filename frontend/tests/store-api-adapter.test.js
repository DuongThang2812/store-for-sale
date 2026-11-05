import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoreApiAdapter } from '../src/services/storeApiAdapter.js';
import { ApplicationError } from '../../backend/supabase/functions/_shared/applicationErrors.js';

test('storeApiAdapter throws SESSION_EXPIRED (401) when session is absent or expired', async () => {
    const mockAuth = {
        async getSession() {
            return null;
        },
    };

    const adapter = createStoreApiAdapter({
        baseUrl: 'https://test.example.com',
        auth: mockAuth,
        fetchFn: async () => assert.fail('fetch should not be called'),
    });

    await assert.rejects(
        () => adapter.listStores(),
        (err) => {
            assert.ok(err instanceof ApplicationError);
            assert.equal(err.code, 'SESSION_EXPIRED');
            assert.equal(err.status, 401);
            return true;
        }
    );
});

test('storeApiAdapter throws CONNECTION_FAILED (503) on network failure and NEVER falls back to demo mode', async () => {
    const mockAuth = {
        async getSession() {
            return { access_token: 'valid-test-jwt-token' };
        },
    };

    const adapter = createStoreApiAdapter({
        baseUrl: 'https://test.example.com',
        auth: mockAuth,
        fetchFn: async () => {
            throw new Error('Failed to fetch');
        },
    });

    await assert.rejects(
        () => adapter.listStores(),
        (err) => {
            assert.ok(err instanceof ApplicationError);
            assert.equal(err.code, 'CONNECTION_FAILED');
            assert.equal(err.status, 503);
            return true;
        }
    );
});

test('storeApiAdapter translates server error response into ApplicationError', async () => {
    const mockAuth = {
        async getSession() {
            return { access_token: 'valid-test-jwt-token' };
        },
    };

    const adapter = createStoreApiAdapter({
        baseUrl: 'https://test.example.com',
        auth: mockAuth,
        fetchFn: async () => {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'Tài khoản bị khóa' },
                    requestId: 'req-123',
                }),
                { status: 403, headers: { 'Content-Type': 'application/json' } }
            );
        },
    });

    await assert.rejects(
        () => adapter.listStores(),
        (err) => {
            assert.ok(err instanceof ApplicationError);
            assert.equal(err.code, 'FORBIDDEN');
            assert.equal(err.status, 403);
            return true;
        }
    );
});

test('storeApiAdapter successfully sends Bearer Authorization and returns mapped store data', async () => {
    const mockAuth = {
        async getSession() {
            return { access_token: 'jwt-super-secret-token' };
        },
    };

    let sentUrl = '';
    let sentHeaders = {};

    const mockStores = [
        {
            id: '11111111-1111-4000-8000-000000000001',
            name: 'Tạp hóa BIN - Tiệm 1',
            role: 'owner',
            permissions: { canSell: true, canManageInventory: true },
        },
    ];

    const adapter = createStoreApiAdapter({
        baseUrl: 'https://api.tap-hoa-bin.com',
        auth: mockAuth,
        fetchFn: async (url, options) => {
            sentUrl = url;
            sentHeaders = options.headers;
            return new Response(
                JSON.stringify({
                    success: true,
                    data: mockStores,
                    requestId: 'req-456',
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
        },
    });

    const result = await adapter.listStores();

    assert.equal(sentUrl, 'https://api.tap-hoa-bin.com/api/v1/stores');
    assert.equal(sentHeaders['Authorization'], 'Bearer jwt-super-secret-token');
    assert.equal(sentHeaders['Accept'], 'application/json');
    assert.ok(sentHeaders['X-Correlation-ID']);
    assert.deepEqual(result, mockStores);
});
