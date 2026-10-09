import { useShopStore } from '../stores/useShopStore.js';
import { useCloudShopStore } from '../stores/useCloudShopStore.js';
import { useCartStore } from '../stores/useCartStore.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { createBackup, snapshotOf, validateSnapshot } from '../utils/backup.js';

const emptyState = () => ({ products: [], customers: [], entries: [], cart: {}, debtCarts: {} });
const signedOutKey = 'little-store-signed-out';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function localShopStorageKey(userId, storeId) {
    if (!uuid.test(userId) || !uuid.test(storeId)) throw new Error('Tài khoản hoặc cửa hàng chưa hợp lệ.');
    return `little-store-local:${userId}:${storeId}`;
}

export function hasLocalShop(userId, storeId, storage = globalThis.localStorage) {
    return storage?.getItem(localShopStorageKey(userId, storeId)) != null;
}

export function clearLocalShop() {
    // Change the persistence destination before clearing, so old data is not overwritten.
    useShopStore.persist.setOptions({ name: signedOutKey });
    useShopStore.setState(emptyState());
    useCartStore.getState().clearCart();
    useCloudShopStore.getState().reset();
}

export function openLocalShop(userId, storeId) {
    const key = localShopStorageKey(userId, storeId);
    clearLocalShop();
    const raw = localStorage.getItem(key);
    const state = raw ? validateSnapshot(JSON.parse(raw).state) : emptyState();
    useShopStore.persist.setOptions({ name: key });
    useShopStore.setState(state);
    return state;
}

function currentLocalKey() {
    const { user, store } = useAccountStore.getState();
    if (!user || !store) throw new Error('Vui lòng đăng nhập và chọn cửa hàng.');
    return localShopStorageKey(user.id, store.id);
}

export async function restoreLocalBackup(backup) {
    if (useAccountStore.getState().dataMode === 'supabase') throw new Error('Cửa hàng đang dùng DB; không thể khôi phục bằng dữ liệu local.');
    const key = currentLocalKey();
    const state = validateSnapshot(backup.state);
    const before = snapshotOf(useShopStore.getState());
    const safety = await createBackup(before, key);
    if (currentLocalKey() !== key || useAccountStore.getState().dataMode === 'supabase') throw new Error('Cửa hàng hoặc chế độ dữ liệu đã thay đổi. Chọn lại file sao lưu.');
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
    const raw = localStorage.getItem(`${currentLocalKey()}:before-restore`);
    return raw ? JSON.parse(raw) : null;
}
