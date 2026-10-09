import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { createSnapshotEncoder } from '../src/utils/cachedStorage.js';

const products = Array.from({ length: 2000 }, (_, i) => ({ id: `p${i}`, name: `Hàng mẫu ${i}`, price: 15000, stock: 100, unit: 'gói', isActive: true }));
const entries = Array.from({ length: 10000 }, (_, i) => ({ id: `e${i}`, kind: 'sale', title: 'Bán hàng · Đã nhận tiền', date: '2026-09-21T01:00:00.000Z', amount: 30000, items: [{ productId: 'p1', name: 'Hàng mẫu 1', quantity: 2, price: 15000, unit: 'gói' }] }));
const snapshots = Array.from({ length: 100 }, (_, i) => ({ state: { products, customers: [], entries, cart: { p1: i + 1 }, debtCarts: {} }, version: 0 }));
const encode = createSnapshotEncoder();
assert.equal(encode(snapshots[0]), JSON.stringify(snapshots[0]));
function measure(fn) {
    const times = [];
    let bytes = 0;
    for (const snapshot of snapshots) {
        const start = performance.now();
        bytes += fn(snapshot).length;
        times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { medianMs: +times[50].toFixed(3), p95Ms: +times[95].toFixed(3), characters: bytes };
}
const baseline = measure(JSON.stringify);
const cached = measure(encode);
assert.equal(baseline.characters, cached.characters);
console.log(JSON.stringify({ scenario: '2000 products, 10000 entries, 100 cart edits', baseline, cached, note: 'Node serialization benchmark only; excludes localStorage I/O, browser layout and FPS.' }, null, 2));
