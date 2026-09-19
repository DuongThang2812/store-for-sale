import { BASIC_UNITS, validateProductPricing } from './productPricing.js';
const MAX_SIZE = 8 * 1024 * 1024;
const kinds = ['sale', 'debt', 'payment', 'stock', 'edit', 'cancel', 'restore'];
const integer = n => Number.isSafeInteger(n) && n >= 0;
const text = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max;
function assert(condition, message) { if (!condition) throw new Error('Bản sao lưu không hợp lệ: ' + message); }
function scan(value, depth = 0) {
    assert(depth <= 15, 'cấu trúc quá sâu.');
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert(!['__proto__', 'constructor', 'prototype'].includes(key), 'có trường dữ liệu không được hỗ trợ.');
        scan(child, depth + 1);
    }
}
export function snapshotOf(state) {
    return structuredClone({ products: state.products, customers: state.customers, entries: state.entries, cart: state.cart || {}, debtCarts: state.debtCarts || {} });
}
export function validateSnapshot(input) {
    assert(input && typeof input === 'object', 'thiếu dữ liệu cửa hàng.');
    assert(new TextEncoder().encode(JSON.stringify(input)).length <= MAX_SIZE, 'tối đa 8 MB.');
    scan(input);
    for (const key of ['products', 'customers', 'entries']) {
        assert(Array.isArray(input[key]) && input[key].length <= 50000, `danh sách ${key} chưa đúng.`);
        const ids = new Set();
        for (const row of input[key]) { assert(row && text(row.id) && !['__proto__', 'constructor', 'prototype'].includes(row.id) && !ids.has(row.id), `mã ${key} bị thiếu hoặc trùng.`); ids.add(row.id); }
    }
    for (const p of input.products) {
        assert(text(p.name, 120) && integer(p.price) && p.price <= 999999999 && integer(p.stock) && BASIC_UNITS.includes(p.unit) && typeof p.isActive === 'boolean', 'tên, giá hoặc số tồn chưa đúng.');
        assert(!p.id.includes('::'), 'mã mặt hàng chưa đúng.');
        validateProductPricing(p);
    }
    for (const c of input.customers) assert(text(c.name, 120) && integer(c.totalDebt), 'thông tin khách hoặc số nợ chưa đúng.');
    for (const e of input.entries) {
        assert(kinds.includes(e.kind) && text(e.title, 500) && text(e.detail || ' ', 2000) && integer(e.amount) && text(e.date, 50) && Number.isFinite(Date.parse(e.date)), 'lịch sử giao dịch chưa đúng.');
        for (const key of ['quantity', 'purchasePrice', 'purchaseTotal', 'refundAmount', 'debtReduction']) if (e[key] !== undefined) assert(integer(e[key]), `giá trị ${key} chưa đúng.`);
        if (e.items !== undefined) {
            assert(Array.isArray(e.items), 'chi tiết đơn chưa đúng.');
            for (const i of e.items) assert(text(i.name, 120) && integer(i.price) && integer(i.quantity) && i.quantity > 0 && (i.stockQuantity === undefined || (integer(i.stockQuantity) && i.stockQuantity > 0)), 'mặt hàng trong lịch sử chưa đúng.');
        }
        if (e.allocations !== undefined) {
            assert(Array.isArray(e.allocations) && e.allocations.every(a => text(a.debtId) && integer(a.amount)), 'phân bổ trả nợ chưa đúng.');
            assert(e.allocations.reduce((sum, a) => sum + a.amount, 0) === e.amount, 'tổng tiền trả nợ chưa khớp.');
        }
    }
    const validIds = new Set(input.entries.map(e => e.id));
    const cancelled = new Set();
    for (const e of input.entries.filter(e => e.kind === 'cancel')) {
        const original = input.entries.find(row => row.id === e.saleId);
        assert(original && ['sale', 'debt'].includes(original.kind) && !cancelled.has(e.saleId) && e.refundAmount + e.debtReduction === original.amount && e.amount === original.amount && original.cancellationId === e.id, 'tham chiếu hủy đơn chưa khớp.');
        cancelled.add(e.saleId);
    }
    for (const e of input.entries) if (e.cancellationId) assert(validIds.has(e.cancellationId), 'thiếu lịch sử hủy đơn.');
    const checkCart = cart => { assert(cart && typeof cart === 'object' && !Array.isArray(cart), 'giỏ hàng chưa đúng.'); for (const [key, q] of Object.entries(cart)) assert(text(key) && integer(q), 'số lượng giỏ hàng chưa đúng.'); };
    checkCart(input.cart || {});
    const debtCarts = input.debtCarts || {};
    assert(debtCarts && typeof debtCarts === 'object' && !Array.isArray(debtCarts), 'giỏ mua chịu chưa đúng.');
    Object.values(debtCarts).forEach(checkCart);
    return snapshotOf(input);
}
async function checksum(state) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(state)));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function createBackup(state, ownerId = null) {
    const snapshot = validateSnapshot(snapshotOf(state));
    return { format: 'little-store-backup', version: 1, createdAt: new Date().toISOString(), ownerId, checksum: await checksum(snapshot), state: snapshot };
}
export async function parseBackup(contents) {
    if (new TextEncoder().encode(contents).length > MAX_SIZE + 2048) throw new Error('File sao lưu vượt 8 MB.');
    let backup;
    try { backup = JSON.parse(contents.replace(/^\uFEFF/, '')); } catch { throw new Error('File không phải bản sao lưu JSON hợp lệ.'); }
    assert(backup && typeof backup === 'object', 'thiếu thông tin bản sao lưu.');
    assert(backup.format === 'little-store-backup' && backup.version === 1, 'định dạng hoặc phiên bản chưa được hỗ trợ.');
    assert(text(backup.createdAt, 50) && Number.isFinite(Date.parse(backup.createdAt)), 'ngày sao lưu chưa đúng.');
    assert(backup.ownerId === null || text(backup.ownerId, 500), 'thông tin tài khoản mẫu chưa đúng.');
    const state = validateSnapshot(backup.state);
    assert(backup.checksum === await checksum(state), 'file đã thay đổi hoặc chưa tải đầy đủ.');
    return { ...backup, state };
}
export function downloadBackup(backup, prefix = 'sao-luu-tap-hoa') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
