import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSessionController } from '../src/services/accountSession.js';
import { accountErrorMessage } from '../src/services/authMessages.js';

const userId = 'a1000000-0000-4000-8000-000000000001';
const storeId = 'a2000000-0000-4000-8000-000000000001';

function accountView() {
    const state = { user: null, store: null, ready: false, authLoading: true, error: '' };
    return {
        getState: () => ({ ...state,
            setChecking: () => Object.assign(state, { user: null, store: null, ready: false, authLoading: true, error: '' }),
            setSignedOut: () => Object.assign(state, { user: null, store: null, ready: true, authLoading: false, error: '' }),
            setAuthenticated: value => Object.assign(state, value, { ready: true, authLoading: false, error: '' }),
            setError: error => Object.assign(state, { user: null, store: null, ready: false, authLoading: false, error }),
        }),
    };
}

test('boot verifies session with Auth server before opening local shop', async () => {
    const calls = [];
    const account = accountView();
    const controller = createAccountSessionController({
        auth: { getSession: async () => ({ user: { id: userId } }), getUser: async () => ({ id: userId, email: 'a@example.invalid' }) },
        stores: { loadContext: async () => ({ stores: [{ id: storeId }], store: { id: storeId, role: 'owner' } }), getProfile: async () => ({ name: 'Owner A' }) },
        account, clearShop: () => calls.push('clear'), openShop: (uid, sid) => calls.push([uid, sid]),
        localExists: () => true,
    });
    await controller.refresh();
    assert.deepEqual(calls.at(-1), [userId, storeId]);
    assert.equal(account.getState().user.email, 'a@example.invalid');
    assert.equal(account.getState().store.id, storeId);
});

test('new shop uses Supabase mode without creating local business data', async () => {
    const account = accountView();
    const controller = createAccountSessionController({
        auth: { getSession: async () => ({ user: { id: userId } }), getUser: async () => ({ id: userId }) },
        stores: { loadContext: async () => ({ stores: [{ id: storeId }], store: { id: storeId } }),
            getProfile: async () => ({ name: 'Owner' }), hasCompletedLegacyImport: async () => false },
        account, localExists: () => false, clearShop: () => {},
        openShop: () => { throw new Error('must not open local shop'); },
    });
    await controller.refresh();
    assert.equal(account.getState().dataMode, 'supabase');
});

test('a stale login response cannot restore shop after cross-tab signout', async () => {
    let finish;
    let signalStarted;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const account = accountView();
    const opened = [];
    const controller = createAccountSessionController({
        auth: { getSession: async () => ({ user: { id: userId } }), getUser: () => { signalStarted(); return new Promise(resolve => { finish = resolve; }); } },
        stores: { loadContext: async () => ({ stores: [], store: { id: storeId } }), getProfile: async () => ({ name: 'Owner' }) },
        account, clearShop: () => opened.push('clear'), openShop: () => opened.push('open'),
    });
    const loading = controller.refresh();
    await started;
    controller.handleAuthEvent('SIGNED_OUT', null);
    finish({ id: userId });
    await loading;
    assert.equal(account.getState().user, null);
    assert.equal(account.getState().ready, true);
    assert.equal(opened.includes('open'), false);
});

test('unverified or offline session does not expose shop data', async () => {
    const account = accountView();
    const controller = createAccountSessionController({
        auth: { getSession: async () => ({ user: { id: userId } }), getUser: async () => { throw new Error('network details'); } },
        stores: { loadContext: () => { throw new Error('must not run'); } },
        account, clearShop: () => {}, openShop: () => { throw new Error('must not open'); },
    });
    await controller.refresh();
    assert.equal(account.getState().user, null);
    assert.equal(account.getState().error.includes('network details'), false);
});

test('account error messages never reveal provider diagnostics', () => {
    const technical = new Error('relation public.profiles does not exist');
    for (const action of ['login', 'signup', 'reset', 'store']) assert.equal(accountErrorMessage(technical, action).includes('public.profiles'), false);
});
