import { create } from 'zustand';

// Supabase Auth owns the session. This store is an in-memory view of a verified user.
export const useAccountStore = create(set => ({
    user: null,
    profile: null,
    stores: [],
    store: null,
    dataMode: 'demo',
    ready: false,
    authLoading: true,
    error: '',
    setChecking: () => set({ user: null, profile: null, stores: [], store: null, dataMode: 'demo', ready: false, authLoading: true, error: '' }),
    setSignedOut: () => set({ user: null, profile: null, stores: [], store: null, dataMode: 'demo', ready: true, authLoading: false, error: '' }),
    setAuthenticated: ({ user, profile, stores, store, dataMode = 'demo' }) => set({ user, profile, stores, store, dataMode, ready: true, authLoading: false, error: '' }),
    setStore: store => set(state => ({ store, stores: state.stores.map(item => item.id === store?.id ? store : item) })),
    setError: error => set({ user: null, profile: null, stores: [], store: null, dataMode: 'demo', ready: false, authLoading: false, error }),
}));
