import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cancellationPlan, debtBalances } from '../src/utils/saleCancellation.js';
import { createBackup, parseBackup, snapshotOf } from '../src/utils/backup.js';
import { summarizeRevenue } from '../src/utils/revenue.js';

function memoryStorage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear() };
}
const storage = memoryStorage();
globalThis.window = { localStorage: storage };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(), configurable: true });
const { useShopStore: store } = await import('../src/stores/useShopStore.js');
const { useAccountStore: account } = await import('../src/stores/useAccountStore.js');
const service = await import('../src/services/accountService.js');
const product = { id: 'p1', name: 'Nước mẫu', unit: 'lon', stock: 100, price: 10000, isActive: true };
const empty = () => ({ products: [structuredClone(product)], customers: [], entries: [], cart: {}, debtCarts: {} });
beforeEach(() => { storage.clear(); sessionStorage.clear(); store.persist.setOptions({ name: 'nha-minh-demo-v1' }); store.setState(empty()); account.getState().setProfile({ id: 'demo', name: 'Mẫu', email: '' }); });
function sell(quantity = 2, customerId) {
    store.getState().setQuantity('p1', quantity, customerId);
    store.getState().checkout(customerId, customerId);
    return store.getState().entries[0].id;
}
test('cash cancellation restores stock, deducts receipts/revenue and cannot repeat', () => {
    const id = sell();
    assert.equal(store.getState().products[0].stock, 98);
    assert.equal(cancellationPlan(store.getState(), id).refundAmount, 20000);
    store.getState().cancelSale(id, 'Chọn nhầm hàng', true);
    assert.equal(store.getState().products[0].stock, 100);
    assert.equal(summarizeRevenue(store.getState().entries, 7).totals.received, 0);
    assert.equal(summarizeRevenue(store.getState().entries, 7).totals.revenue, 0);
    assert.throws(() => store.getState().cancelSale(id, 'Lặp lại', true), /đã hủy/);
});
test('unpaid credit cancellation clears debt without a cash refund', () => {
    const customer = store.getState().addCustomer('Khách A', '', '');
    const id = sell(3, customer);
    assert.equal(cancellationPlan(store.getState(), id).debtReduction, 30000);
    assert.equal(cancellationPlan(store.getState(), id).refundAmount, 0);
    store.getState().cancelSale(id, 'Khách trả toàn bộ', true);
    assert.equal(store.getState().customers.length, 0);
    assert.equal(store.getState().products[0].stock, 100);
});
test('part-paid credit reduces only outstanding balance and refunds the paid part', () => {
    const customer = store.getState().addCustomer('Khách A', '', '');
    const id = sell(5, customer);
    store.getState().payDebt(customer, 20000);
    const plan = cancellationPlan(store.getState(), id);
    assert.equal(plan.debtReduction, 30000); assert.equal(plan.refundAmount, 20000);
    store.getState().cancelSale(id, 'Đơn nhầm', true);
    assert.equal(store.getState().customers.length, 0);
    assert.equal(summarizeRevenue(store.getState().entries, 7).totals.received, 0);
});
test('fully paid and removed customer can still have invoice refunded', () => {
    const customer = store.getState().addCustomer('Khách A', '', '');
    const id = sell(2, customer);
    store.getState().payDebt(customer, 20000);
    assert.equal(store.getState().customers.length, 0);
    assert.equal(cancellationPlan(store.getState(), id).refundAmount, 20000);
    store.getState().cancelSale(id, 'Trả hàng', true);
    assert.equal(store.getState().products[0].stock, 100);
});
test('repayment allocation remains stable across cancellation of one of two invoices', () => {
    const customer = store.getState().addCustomer('Khách A', '', '');
    const first = sell(2, customer), second = sell(3, customer);
    store.getState().payDebt(customer, 25000);
    assert.equal(debtBalances(store.getState().entries, customer).get(second), 25000);
    store.getState().cancelSale(first, 'Trả đơn đầu', true);
    assert.equal(store.getState().customers[0].totalDebt, 25000);
    assert.equal(debtBalances(store.getState().entries, customer).get(second), 25000);
    store.getState().payDebt(customer, 25000);
    assert.equal(cancellationPlan(store.getState(), second).refundAmount, 30000);
});
test('missing details and missing acknowledgment cannot change inventory', () => {
    const id = sell();
    assert.throws(() => store.getState().cancelSale(id, 'Nhầm', false));
    assert.throws(() => store.getState().cancelSale(id, '', true));
    assert.equal(store.getState().products[0].stock, 98);
    store.setState({ entries: [{ id: 'legacy', kind: 'sale', title: 'Đơn cũ', detail: '', amount: 10000, date: new Date().toISOString() }] });
    assert.throws(() => cancellationPlan(store.getState(), 'legacy'), /chi tiết/);
});
test('backup round trip preserves state and rejects corrupt/unsupported files', async () => {
    const id = sell(); store.getState().cancelSale(id, 'Nhầm', true);
    const backup = await createBackup(store.getState(), 'demo');
    const parsed = await parseBackup(JSON.stringify(backup));
    assert.deepEqual(parsed.state, JSON.parse(JSON.stringify(snapshotOf(store.getState()))));
    const changed = structuredClone(backup); changed.state.products[0].stock++;
    await assert.rejects(() => parseBackup(JSON.stringify(changed)), /thay đổi/);
    await assert.rejects(() => parseBackup(JSON.stringify({ ...backup, version: 99 })), /phiên bản/);
    await assert.rejects(() => parseBackup('null'), /thiếu thông tin/);
});
test('sample accounts are isolated locally; leaving does not clear the previous account', () => {
    service.openDemoAccount('a@example.com', 'Tiệm A');
    store.getState().saveProduct(product);
    service.leaveDemoAccount();
    assert.equal(account.getState().profile, null);
    service.openDemoAccount('b@example.com', 'Tiệm B');
    assert.equal(store.getState().products.length, 0);
    service.openDemoAccount('a@example.com');
    assert.equal(store.getState().products[0].name, product.name);
});
test('restore previews data, retains safety backup and affects only active sample account', async () => {
    const backup = await createBackup(store.getState(), 'demo');
    service.openDemoAccount('b@example.com', 'Tiệm B');
    await service.restoreDemoBackup(backup);
    assert.equal(store.getState().products[0].stock, 100);
    assert.equal(store.getState().entries[0].kind, 'restore');
    assert.equal(service.readSafetyBackup().state.products.length, 0);
    assert.equal(JSON.parse(storage.getItem('nha-minh-demo-v1')).state.products[0].stock, 100);
});
test('storage failure while saving the safety copy leaves current state intact', async () => {
    const backup = await createBackup(empty(), 'demo');
    sell();
    const before = snapshotOf(store.getState());
    const original = storage.setItem;
    storage.setItem = () => { throw new Error('Bộ nhớ đầy'); };
    try { await assert.rejects(() => service.restoreDemoBackup(backup), /Bộ nhớ đầy/); }
    finally { storage.setItem = original; }
    assert.deepEqual(snapshotOf(store.getState()), before);
});
