import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectLegacySnapshot, prepareLegacyMigration, readLegacyShop } from '../src/services/legacyMigration.js';
import { mapLegacySnapshot } from '../src/services/legacyImportService.js';
import { parseBackup } from '../src/utils/backup.js';

const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const storeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const key = `little-store-local:${userId}:${storeId}`;
const date = '2026-10-01T12:00:00.000Z';

const snapshot = () => ({
    products: [{ id: 'p1', name: 'Coca', price: 15000, stock: 22, unit: 'lon', isActive: true, category: 'Nước' }],
    customers: [{ id: 'c1', name: 'Lan', totalDebt: 20000 }],
    entries: [
        { id: 'paid-c2', kind: 'payment', customerId: 'c2', title: 'Trả nợ', amount: 20000,
            allocations: [{ debtId: 'debt-c2', amount: 20000 }], date },
        { id: 'debt-c2', kind: 'debt', customerId: 'c2', title: 'Đơn cũ', detail: 'Không có chi tiết', amount: 20000, date },
        { id: 'pay-c1', kind: 'payment', customerId: 'c1', title: 'Trả nợ', amount: 10000,
            allocations: [{ debtId: 'sale-c1', amount: 10000 }], date },
        { id: 'sale-c1', kind: 'debt', customerId: 'c1', title: 'Mua chịu', amount: 30000, date,
            items: [{ productId: 'p1', name: 'Coca', quantity: 2, unit: 'lon', price: 15000,
                lineAmount: 30000, stockQuantity: 2, stockUnit: 'lon' }] },
    ],
    cart: {}, debtCarts: {},
});

test('preflight only reads the verified user/shop key and creates a portable backup', async () => {
    const reads = [];
    const storage = { getItem(requested) { reads.push(requested); return JSON.stringify({ state: snapshot(), version: 0 }); } };
    const prepared = await prepareLegacyMigration(userId, storeId, storage);
    assert.deepEqual(reads, [key]);
    assert.equal(prepared.storageKey, key);
    assert.equal(prepared.report.counts.products, 1);
    assert.equal(prepared.report.counts.sales, 2);
    assert.equal(prepared.report.counts.archiveOnlySales, 1);
    assert.equal(prepared.report.totals.outstandingDebt, 20000);
    assert.equal(prepared.report.review.orphanOutstandingCustomerCount, 0);
    assert.deepEqual(prepared.report.review.debtDiscrepancies, []);
    assert.equal(prepared.report.needsManualReview, true);
    const roundTrip = await parseBackup(JSON.stringify(prepared.backup));
    assert.equal(roundTrip.ownerId, key);
    assert.equal(roundTrip.state.products[0].stock, 22);
});

test('preflight detects debt mismatch without touching local or cloud data', () => {
    const state = snapshot();
    state.customers[0].totalDebt = 19000;
    const report = inspectLegacySnapshot(state);
    assert.deepEqual(report.review.debtDiscrepancies, [{
        customerId: 'c1', customerName: 'Lan', localBalance: 19000, ledgerBalance: 20000,
    }]);
    assert.equal(report.needsManualReview, true);
});

test('unknown persisted versions and broken JSON stop before migration', () => {
    assert.throws(() => readLegacyShop(userId, storeId, { getItem: () => '{bad' }), /không đọc được/);
    assert.throws(() => readLegacyShop(userId, storeId, {
        getItem: () => JSON.stringify({ version: 1, state: snapshot() }),
    }), /chưa được hỗ trợ/);
});

test('legacy mapper carries current balances and archives source entries without replaying sales', () => {
    const mapped = mapLegacySnapshot(storeId, snapshot());
    assert.deepEqual(mapped.products.map(row => [row.legacy_id, row.stock_base]), [['p1', 22]]);
    assert.deepEqual(mapped.customers.map(row => [row.legacy_id, row.current_debt]), [['c1', 20000]]);
    assert.equal(mapped.entries.length, 4);
    assert.deepEqual(mapped.entries.find(row => row.legacy_id === 'sale-c1').source_entry.items[0].stockQuantity, 2);
    assert.equal('total_amount' in mapped.entries[0], false);
});

test('legacy mapper refuses inconsistent debt before sending any RPC', () => {
    const state = snapshot();
    state.customers[0].totalDebt = 19000;
    assert.throws(() => mapLegacySnapshot(storeId, state), /Sổ nợ cũ chưa khớp/);
});
