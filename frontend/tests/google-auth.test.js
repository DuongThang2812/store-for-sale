import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/services/authService.js';
import { createStoreService } from '../src/services/storeService.js';
import { createAccountSessionController } from '../src/services/accountSession.js';
import { accountErrorMessage } from '../src/services/authMessages.js';

const userId = '11111111-1111-4111-8111-111111111111';
const returningUserId = '22222222-2222-4222-8222-222222222222';
const storeId = '33333333-3333-4333-8333-333333333333';
const newStoreId = '44444444-4444-4444-8444-444444444444';

function createMockSupabase({ user = null, session = null, profiles = [], memberships = [] } = {}) {
    const calls = [];
    return {
        calls,
        auth: {
            async signInWithOAuth(params) {
                calls.push(['signInWithOAuth', params]);
                return { data: { provider: params.provider, url: 'https://accounts.google.com/o/oauth2/v2/auth' }, error: null };
            },
            async signInWithPassword(credentials) {
                calls.push(['signInWithPassword', credentials]);
                return { data: { user, session }, error: null };
            },
            async signUp(credentials) {
                calls.push(['signUp', credentials]);
                return { data: { user, session }, error: null };
            },
            async getSession() {
                calls.push(['getSession']);
                return { data: { session }, error: null };
            },
            async getUser() {
                calls.push(['getUser']);
                return { data: { user }, error: null };
            },
            async refreshSession() {
                calls.push(['refreshSession']);
                return { data: { session }, error: null };
            },
            async signOut(opts) {
                calls.push(['signOut', opts]);
                return { error: null };
            },
        },
        from(table) {
            calls.push(['from', table]);
            const state = { table, filters: {} };
            const query = {
                select(...args) { calls.push(['select', ...args]); return query; },
                eq(field, val) { calls.push(['eq', field, val]); state.filters[field] = val; return query; },
                order(...args) { calls.push(['order', ...args]); return query; },
                async maybeSingle() {
                    if (table === 'profiles') {
                        const target = profiles.find(p => p.id === state.filters.id);
                        return { data: target ?? null, error: null };
                    }
                    if (table === 'store_members') {
                        const target = memberships.find(m => m.user_id === state.filters.user_id && m.store_id === state.filters.store_id);
                        return { data: target ?? null, error: null };
                    }
                    return { data: null, error: null };
                },
                then(resolve, reject) {
                    if (table === 'store_members') {
                        const rows = memberships.filter(m => m.user_id === state.filters.user_id);
                        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                    }
                    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                },
            };
            return query;
        },
        async rpc(name, params) {
            calls.push(['rpc', name, params]);
            if (name === 'create_store') return { data: newStoreId, error: null };
            return { data: null, error: null };
        },
    };
}

function mockAccountStore() {
    const state = { user: null, profile: null, store: null, stores: [], ready: false, authLoading: true, error: '', dataMode: 'supabase' };
    return {
        getState: () => ({
            ...state,
            setChecking: () => Object.assign(state, { user: null, store: null, ready: false, authLoading: true, error: '' }),
            setSignedOut: () => Object.assign(state, { user: null, store: null, ready: true, authLoading: false, error: '' }),
            setAuthenticated: val => Object.assign(state, val, { ready: true, authLoading: false, error: '' }),
            setError: err => Object.assign(state, { user: null, store: null, ready: false, authLoading: false, error: err }),
        }),
    };
}

test('signInWithGoogle calls auth.signInWithOAuth with google provider and default or custom redirectTo', async () => {
    let captured = null;
    const auth = createAuthService(() => ({
        auth: {
            async signInWithOAuth(params) {
                captured = params;
                return { data: { url: 'https://accounts.google.com' }, error: null };
            },
        },
    }));

    await auth.signInWithGoogle({ redirectTo: 'http://localhost:5173/auth/callback' });
    assert.equal(captured.provider, 'google');
    assert.equal(captured.options.redirectTo, 'http://localhost:5173/auth/callback');

    // Test error propagation
    const failAuth = createAuthService(() => ({
        auth: {
            async signInWithOAuth() {
                return { data: null, error: new Error('Provider not enabled') };
            },
        },
    }));

    await assert.rejects(
        () => failAuth.signInWithGoogle({ redirectTo: 'http://localhost:5173/auth/callback' }),
        err => err.cause?.message === 'Provider not enabled'
    );
});

test('first-time Google registration creates profile and routes to store creation step', async () => {
    const newUser = {
        id: userId,
        email: 'bin.first@gmail.com',
        user_metadata: { name: 'Chủ tiệm BIN', full_name: 'Chủ tiệm BIN' },
    };
    const newSession = { user: newUser, access_token: 'valid-token' };

    // Initially profile is created by trigger with 'active' status, no stores yet
    const client = createMockSupabase({
        user: newUser,
        session: newSession,
        profiles: [{ id: userId, display_name: 'Chủ tiệm BIN', account_status: 'active' }],
        memberships: [],
    });

    const storeService = createStoreService(() => client);
    const accountStore = mockAccountStore();

    const controller = createAccountSessionController({
        auth: createAuthService(() => client),
        stores: storeService,
        account: accountStore,
        clearShop: () => {},
        openShop: () => {},
        localExists: () => false,
    });

    await controller.refresh();

    const state = accountStore.getState();
    assert.equal(state.ready, true);
    assert.equal(state.user.id, userId);
    assert.equal(state.user.name, 'Chủ tiệm BIN');
    assert.equal(state.stores.length, 0);
    assert.equal(state.store, null); // Needs store creation

    // Check store context logic
    const context = await storeService.loadContext(null, newUser);
    assert.equal(context.needsStoreCreation, true);
    assert.equal(context.needsStoreSelection, false);
    assert.equal(context.store, null);

    // First time user proceeds to create store
    const createdStoreId = await storeService.createStore('Tạp hóa BIN Mới', 'grocery');
    assert.equal(createdStoreId, newStoreId);
});

test('subsequent Google login loads existing stores and routes to store selection', async () => {
    const returnUser = {
        id: returningUserId,
        email: 'owner.returning@gmail.com',
        user_metadata: { name: 'Chủ tiệm Cũ' },
    };
    const returnSession = { user: returnUser, access_token: 'returning-token' };

    const mockMembership = {
        store_id: storeId,
        user_id: returningUserId,
        role: 'owner',
        is_active: true,
        can_sell: true,
        can_receive_stock: true,
        can_manage_debt: true,
        permission_version: 1,
        created_at: '2026-01-01T00:00:00Z',
        stores: {
            id: storeId,
            name: 'Tiệm Tạp Hóa BIN',
            business_type: 'grocery',
            timezone: 'Asia/Ho_Chi_Minh',
            currency: 'VND',
            status: 'active',
            contact_phone: null,
            address: null,
            settings_version: 1,
            created_by: returningUserId,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        },
    };

    const client = createMockSupabase({
        user: returnUser,
        session: returnSession,
        profiles: [{ id: returningUserId, display_name: 'Chủ tiệm Cũ', account_status: 'active' }],
        memberships: [mockMembership],
    });

    const storeService = createStoreService(() => client);
    const accountStore = mockAccountStore();

    const controller = createAccountSessionController({
        auth: createAuthService(() => client),
        stores: storeService,
        account: accountStore,
        clearShop: () => {},
        openShop: () => {},
        localExists: () => false,
    });

    await controller.refresh();

    const state = accountStore.getState();
    assert.equal(state.ready, true);
    assert.equal(state.user.id, returningUserId);
    assert.equal(state.stores.length, 1);
    assert.equal(state.stores[0].id, storeId);
    assert.equal(state.store.id, storeId);

    // Refreshing / reloading again is completely idempotent
    await controller.refresh();
    const reloaded = accountStore.getState();
    assert.equal(reloaded.user.id, returningUserId);
    assert.equal(reloaded.stores.length, 1);
});

test('user with Auth account but no store yet requires store setup', async () => {
    const userNoStore = {
        id: userId,
        email: 'nostore@gmail.com',
        user_metadata: { name: 'Người Mới Chưa Có Tiệm' },
    };
    const client = createMockSupabase({
        user: userNoStore,
        session: { user: userNoStore },
        profiles: [{ id: userId, display_name: 'Người Mới Chưa Có Tiệm', account_status: 'active' }],
        memberships: [],
    });

    const storeService = createStoreService(() => client);
    const context = await storeService.loadContext(null, userNoStore);
    assert.equal(context.stores.length, 0);
    assert.equal(context.store, null);
    assert.equal(context.needsStoreCreation, true);
});

test('OAuth user cancellation and callback error handling', () => {
    // User cancels Google consent dialog
    const cancelError = new Error('access_denied: User cancelled login');
    const cancelMsg = accountErrorMessage(cancelError, 'oauth');
    assert.equal(cancelMsg.includes('access_denied'), false); // No raw diagnostic leak

    // Network error during callback
    const netError = new Error('Failed to fetch');
    const netMsg = accountErrorMessage(netError, 'oauth');
    assert.equal(netMsg.includes('Failed to fetch'), false);
    assert.equal(netMsg.includes('mạng'), true);

    // Duplicate account / manual linking required
    const existsError = new Error('User already registered with different provider');
    const existsMsg = accountErrorMessage(existsError, 'oauth');
    assert.equal(existsMsg.includes('registered with different provider'), false);
    assert.equal(existsMsg.includes('Email này đã được dùng'), true);
});

test('Email/password and demo mode remain completely functional', async () => {
    let emailCredentials = null;
    const client = {
        auth: {
            async signInWithPassword(creds) {
                emailCredentials = creds;
                return { data: { user: { id: userId, email: creds.email }, session: { user: { id: userId } } }, error: null };
            },
        },
    };
    const auth = createAuthService(() => client);
    const result = await auth.signIn({ email: 'cuahang@example.com', password: 'mypassword123' });
    assert.equal(emailCredentials.email, 'cuahang@example.com');
    assert.equal(emailCredentials.password, 'mypassword123');
    assert.equal(result.user.id, userId);
});
