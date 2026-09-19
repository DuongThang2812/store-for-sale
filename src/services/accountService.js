import { useShopStore } from '../stores/useShopStore.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { createBackup, snapshotOf, validateSnapshot } from '../utils/backup.js';

export function profileStorageKey(profile) {
    return profile?.id === 'demo' ? 'nha-minh-demo-v1' : `little-store-profile:${profile.id}`;
}
const emptyState = () => ({ products: [], customers: [], entries: [], cart: {}, debtCarts: {} });
export function openDemoAccount(email = '', name = '') {
    const normalized = email.trim().toLowerCase();
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Vui lòng nhập email đúng định dạng.');
    const profile = normalized ? { id: encodeURIComponent(normalized), email: normalized, name: name.trim() || normalized.split('@')[0] } : { id: 'demo', email: '', name: 'Cửa hàng dùng thử' };
    const key = profileStorageKey(profile);
    let state;
    try {
        const raw = localStorage.getItem(key);
        state = raw ? validateSnapshot(JSON.parse(raw).state) : profile.id === 'demo' ? snapshotOf(useShopStore.getInitialState()) : emptyState();
        // Check storage before touching the current in-memory profile.
        localStorage.setItem(key, JSON.stringify({ state, version: 0 }));
        useAccountStore.getState().setProfile(profile);
        useShopStore.persist.setOptions({ name: key });
        useShopStore.setState(state);
    } catch (e) { throw new Error(`Chưa mở được dữ liệu mẫu: ${e.message}`); }
    return profile;
}
export function initializeDemoAccount() {
    const profile = useAccountStore.getState().profile;
    if (!profile) { useShopStore.persist.setOptions({ name: 'little-store-signed-out' }); useShopStore.setState(emptyState()); useAccountStore.getState().setReady(); return; }
    try { openDemoAccount(profile.email, profile.name); }
    catch (e) { useAccountStore.getState().setError(e.message); }
}
export function leaveDemoAccount() {
    // Never persist an empty state into the previous account when leaving it.
    useShopStore.persist.setOptions({ name: 'little-store-signed-out' });
    useShopStore.setState(emptyState());
    useAccountStore.getState().setProfile(null);
}
export async function restoreDemoBackup(backup) {
    const profile = useAccountStore.getState().profile;
    if (!profile) throw new Error('Chọn tài khoản mẫu trước khi khôi phục.');
    const state = validateSnapshot(backup.state);
    const before = snapshotOf(useShopStore.getState());
    const safety = await createBackup(before, profile.id);
    if (useAccountStore.getState().profile?.id !== profile.id) throw new Error('Tài khoản đã thay đổi. Chọn lại file sao lưu.');
    const key = profileStorageKey(profile);
    // Local safety copy must succeed before replacing current data.
    localStorage.setItem(`${key}:before-restore`, JSON.stringify(safety));
    const restored = {
        ...state,
        entries: [{ id: crypto.randomUUID(), kind: 'restore', title: 'Khôi phục bản sao lưu', detail: `Từ bản sao lưu ngày ${new Date(backup.createdAt).toLocaleString('vi-VN')}`, amount: 0, date: new Date().toISOString() }, ...state.entries],
    };
    validateSnapshot(restored);
    localStorage.setItem(key, JSON.stringify({ state: restored, version: 0 }));
    useShopStore.setState(restored);
}
export function readSafetyBackup() {
    const profile = useAccountStore.getState().profile;
    const raw = profile && localStorage.getItem(`${profileStorageKey(profile)}:before-restore`);
    return raw ? JSON.parse(raw) : null;
}
