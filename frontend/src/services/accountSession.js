import { authService } from './authService.js';
import { storeService } from './storeService.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { clearLocalShop, hasLocalShop, openLocalShop } from './accountService.js';
import { accountErrorMessage } from './authMessages.js';

function withTimeout(promise, milliseconds = 12000) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Auth request timed out')), milliseconds); }),
    ]).finally(() => clearTimeout(timer));
}

/** Serial numbers prevent an old network response from restoring another user's data. */
export function createAccountSessionController({ auth = authService, stores = storeService, account = useAccountStore, clearShop = clearLocalShop, openShop = openLocalShop, localExists = hasLocalShop } = {}) {
    let generation = 0;
    const signedOut = () => {
        generation += 1;
        clearShop();
        account.getState().setSignedOut();
    };
    const refresh = async (preferredStoreId = null) => {
        const current = ++generation;
        clearShop();
        account.getState().setChecking();
        try {
            const session = await withTimeout(auth.getSession());
            if (current !== generation) return;
            if (!session?.user?.id) { signedOut(); return; }
            // getUser asks Auth to validate the server-side identity; getSession alone is not a security check.
            const user = await withTimeout(auth.getUser());
            if (current !== generation) return;
            if (!user || user.id !== session.user.id) { signedOut(); return; }
            const [context, profile] = await withTimeout(Promise.all([
                stores.loadContext(preferredStoreId, user), stores.getProfile(user),
            ]));
            if (current !== generation) return;
            let dataMode = 'demo';
            if (context.store) {
                const local = localExists(user.id, context.store.id);
                const imported = local ? await withTimeout(stores.hasCompletedLegacyImport?.(context.store.id) ?? Promise.resolve(false)) : false;
                if (current !== generation) return;
                dataMode = imported || !local ? 'supabase' : 'demo';
                if (dataMode === 'demo') openShop(user.id, context.store.id);
            }
            account.getState().setAuthenticated({
                user: { id: user.id, email: user.email || '', name: profile.name },
                profile,
                stores: context.stores,
                store: context.store,
                dataMode,
            });
        } catch (error) {
            if (current !== generation) return;
            clearShop();
            account.getState().setError(accountErrorMessage(error, 'store'));
        }
    };
    const handleAuthEvent = (event, session) => {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT' || !session?.user?.id) { signedOut(); return; }
        const state = account.getState();
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && state.authLoading) return;
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && state.ready && state.user?.id === session.user.id) return;
        if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) {
            queueMicrotask(() => { void refresh(); });
        }
    };
    return { refresh, signedOut, handleAuthEvent, dispose: () => { generation += 1; } };
}

export const accountSession = createAccountSessionController();
