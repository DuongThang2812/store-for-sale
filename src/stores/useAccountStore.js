import { create } from 'zustand';

function savedProfile() {
    try { const raw = sessionStorage.getItem('little-store-demo-profile'); const value = raw ? JSON.parse(raw) : undefined; if (value === null) return null; return value && typeof value.id === 'string' ? value : { id: 'demo', name: 'Cửa hàng dùng thử', email: '' }; }
    catch { return { id: 'demo', name: 'Cửa hàng dùng thử', email: '' }; }
}
// UI preview only. Profiles separate browser data; they do not authenticate users.
export const useAccountStore = create(set => ({
    profile: savedProfile(), ready: false, error: '',
    setProfile: profile => {
        sessionStorage.setItem('little-store-demo-profile', JSON.stringify(profile));
        set({ profile, ready: true, error: '' });
    },
    setReady: () => set({ ready: true, error: '' }),
    setError: error => set({ ready: false, error }),
}));
