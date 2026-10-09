import test from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotEncoder, createCachedStorage } from '../src/utils/cachedStorage.js';
import { findProduct } from '../src/utils/productLookup.js';
import { cartLines } from '../src/utils/productPricing.js';

test('cached encoding preserves JSON format, Unicode, optional values and changed slices', () => {
    const encode = createSnapshotEncoder();
    const state = { products: [{ id: 'a', name: 'Đường "trắng"', pricing: undefined }], entries: [], cart: { a: 1 }, optional: undefined };
    for (const snapshot of [
        { state, version: 0 },
        { state: { ...state, cart: { a: 2 } }, version: 0 },
        { state: { ...state, products: [{ ...state.products[0], price: 15000 }], entries: [{ id: 'sale' }] }, version: 1 },
        { state: { products: [], entries: [], cart: {} } },
    ]) assert.equal(encode(snapshot), JSON.stringify(snapshot));
});

test('unchanged inventory and history are not serialized again on cart edits', () => {
    let visits = 0;
    const entries = [{ get detail() { visits++; return 'Đã nhận tiền'; } }];
    const encode = createSnapshotEncoder();
    for (let quantity = 1; quantity <= 50; quantity++) encode({ state: { entries, cart: { a: quantity } }, version: 0 });
    assert.equal(visits, 1);
});

test('storage writes immediately, isolates keys and surfaces write failures', () => {
    const records = new Map();
    let fail = false;
    const adapter = createCachedStorage(() => ({
        getItem: key => records.get(key) ?? null,
        setItem: (key, value) => { if (fail) throw new Error('full'); records.set(key, value); },
        removeItem: key => records.delete(key),
    }));
    const value = { state: { products: [], entries: [], cart: { a: 2 } }, version: 0 };
    adapter.setItem('A', value);
    assert.deepEqual(JSON.parse(records.get('A')), value);
    adapter.setItem('B', { ...value, state: { ...value.state, cart: {} } });
    assert.deepEqual(adapter.getItem('A'), value);
    fail = true;
    assert.throws(() => adapter.setItem('A', { ...value, version: 1 }), /full/);
    assert.deepEqual(adapter.getItem('A'), value);
    adapter.removeItem('B');
    assert.equal(adapter.getItem('B'), null);
});

test('product index follows new stock and pricing arrays without reusing old products', () => {
    const products = [{ id: 'a', stock: 20, unit: 'gói', price: 1000 }];
    assert.equal(findProduct(products, 'a'), products[0]);
    const updated = [{ ...products[0], stock: 15, price: 1200 }];
    assert.equal(findProduct(updated, 'a'), updated[0]);
    assert.equal(findProduct(updated, 'missing'), undefined);
    assert.equal(cartLines(updated, { a: 3 })[0].amount, 3600);
    assert.equal(cartLines(updated, { missing: 1 })[0].invalid, true);
});
