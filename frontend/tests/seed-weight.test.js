import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { availableForOption, buildPricing, cartKey, cartLines, createPricingDraft, moneyForBaseQuantity, saleOptions } from '../src/utils/productPricing.js';
import { mapProduct, mapProductCommand } from '../src/mappers/productMapper.js';
import { mapSaleCommand } from '../src/mappers/transactionMapper.js';
import { mapStockCsvRows } from '../src/mappers/stockCsvMapper.js';
import { parseStockCsv, planStockImport, productCsvRows, stockCsvTemplate } from '../src/utils/stockCsv.js';
import { createBackup, parseBackup } from '../src/utils/backup.js';

const shopId = 'fb000000-0000-4000-8000-000000000001';
const productId = 'fb000000-0000-4000-8000-000000000002';
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
const { useShopStore: store } = await import('../src/stores/useShopStore.js');
const { useCloudShopStore: cloud } = await import('../src/stores/useCloudShopStore.js');
const csv = rows => rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
function seeds(stock = 5000, baseUnit = 'gram') {
    return { id: productId, name: 'Hạt hướng dương', stock, isActive: true,
        ...buildPricing({ ...createPricingDraft(null, 'seeds'), baseUnit, purchasePackPrice: '100000', retailPrice: '15000', retailPackPrice: '140000' }) };
}
beforeEach(() => {
    values.clear();
    store.persist.setOptions({ name: 'seed-weight-test' });
    store.setState({ products: [seeds()], customers: [], entries: [], cart: {}, debtCarts: {} });
});

test('new seeds map gram stock and separate kg/lang prices without a client balance payload', () => {
    const product = seeds();
    const command = mapProductCommand(shopId, product);
    assert.equal(command.p_base_unit, 'gram');
    assert.deepEqual(command.p_units.map(unit => [unit.key, unit.factor, unit.sale_price, unit.can_sell]),
        [['base', 1, null, false], ['lang', 100, 15000, true], ['pack', 1000, 140000, true]]);
    const mapped = mapProduct({ id: productId, store_id: shopId, name: product.name, category: 'Hạt', product_group: 'seeds', base_unit: 'gram',
        units: command.p_units, stock_base: '5000', low_stock_threshold: '500', version: '1', is_active: true });
    assert.deepEqual(saleOptions(mapped), saleOptions(product));
    const intent = mapSaleCommand(shopId, { requestId: shopId, items: [{ productId, unitKey: 'pack', quantity: 1.5, amount: 1, stock: 1 }] });
    assert.deepEqual(intent.p_items, [{ product_id: productId, unit_key: 'pack', quantity: 1.5 }]);
    assert.equal(buildPricing({ ...createPricingDraft(product), retailPackPrice: '' }).pricing.retailPackPrice, 150000);
});

test('5 kg selling 1.5 kg leaves 3500 grams and cancellation restores stock once', async () => {
    store.getState().setQuantity(cartKey(productId, 'pack'), '1.5');
    assert.equal(store.getState().cart[cartKey(productId, 'pack')], 1500);
    store.getState().checkout();
    const state = store.getState();
    assert.equal(state.products[0].stock, 3500);
    assert.equal(state.entries[0].amount, 210000);
    assert.deepEqual([state.entries[0].items[0].unit, state.entries[0].items[0].stockQuantity], ['kg', 1500]);
    const backup = await createBackup(state);
    assert.equal((await parseBackup(JSON.stringify(backup))).state.products[0].stock, 3500);
    const saleId = state.entries[0].id;
    store.getState().cancelSale(saleId, 'Khách trả hàng', true);
    assert.equal(store.getState().products[0].stock, 5000);
    assert.throws(() => store.getState().cancelSale(saleId, 'Khách trả hàng', true));
    assert.equal(store.getState().products[0].stock, 5000);
});

test('mixed kg/lang share stock, clamp correctly and reject sub-gram quantities', async () => {
    const kg = cartKey(productId, 'pack'), lang = cartKey(productId, 'lang');
    store.getState().setQuantity(kg, 4.999);
    assert.equal(availableForOption(seeds(), saleOptions(seeds())[0], store.getState().cart), 0.01);
    store.getState().setQuantity(lang, 1);
    assert.equal(store.getState().cart[lang], 1);
    store.getState().setQuantity(lang, '0.001');
    assert.equal(store.getState().cart[lang], 1);
    assert.deepEqual(cartLines(store.getState().products, store.getState().cart).map(line => [line.quantity, line.baseQuantity, line.amount]),
        [[4.999, 4999, 699860], [0.01, 1, 150]]);
    store.getState().checkout();
    assert.equal(store.getState().products[0].stock, 0);
    const backup = await createBackup(store.getState());
    assert.equal((await parseBackup(JSON.stringify(backup))).state.entries[0].amount, 700010);
    store.getState().cancelSale(store.getState().entries[0].id, 'Trả lại toàn bộ hàng', true);
    assert.equal(store.getState().products[0].stock, 5000);
    assert.equal(moneyForBaseQuantity(50, 1, 100), 1);
});

test('cloud draft carts retain grams across mixed units and keep debt drafts separate', () => {
    cloud.setState({ storeId: shopId, products: [seeds()], customers: [{ id: shopId }], cart: {}, debtCarts: {} });
    const kg = cartKey(productId, 'pack'), lang = cartKey(productId, 'lang');
    cloud.getState().setQuantity(kg, 4.999);
    cloud.getState().setQuantity(lang, 0.02);
    assert.deepEqual(cloud.getState().cart, { [kg]: 4999, [lang]: 1 });
    cloud.getState().setQuantity(lang, '0.001');
    assert.equal(cloud.getState().cart[lang], 1);
    cloud.getState().setQuantity(lang, 1.25, shopId);
    assert.equal(cloud.getState().debtCarts[shopId][lang], 125);
    assert.equal(cloud.getState().cart[lang], 1);
    assert.equal(cloud.getState().products[0].stock, 5000);
});

test('weighted seed CSV receipts capture kg cost and normalize a gram export for DB', () => {
    const rows = parseStockCsv(csv(stockCsvTemplate('seeds')));
    store.setState({ products: [], entries: [] });
    store.getState().importProducts(rows);
    const state = store.getState();
    assert.equal(state.products[0].stock, 2000);
    assert.equal(state.entries[0].purchasePrice, 100000);
    assert.equal(state.entries[0].purchaseTotal, 200000);
    const exported = parseStockCsv(csv(productCsvRows([seeds()])));
    const receipt = mapStockCsvRows(shopId, exported, [seeds()])[0];
    assert.deepEqual(receipt, { existing_product_id: productId, product: null, unit_key: 'pack', quantity: 5, unit_cost: 100000 });
    const newReceipt = mapStockCsvRows(shopId, rows, [])[0];
    assert.equal(newReceipt.product.base_unit, 'gram');
    assert.equal(newReceipt.quantity, 2);
    assert.equal(newReceipt.unit_cost, 100000);
});

test('lang-based CSV receipt converts its own cost to kg and rejects sub-gram imports', () => {
    const headings = ['Tên hàng', 'Giá bán', 'Số lượng', 'Đơn vị', 'Giá nhập'];
    const rows = parseStockCsv(csv([headings, ['Hạt hướng dương', 15000, 1.25, 'lạng', 11000]]));
    assert.deepEqual(mapStockCsvRows(shopId, rows, [seeds()])[0],
        { existing_product_id: productId, product: null, unit_key: 'pack', quantity: 0.125, unit_cost: 110000 });
    assert.throws(() => planStockImport([{ ...rows[0], quantity: 0.001 }], [seeds()]), /đơn vị nhỏ nhất/);
    store.getState().importProducts(rows);
    assert.equal(store.getState().products[0].stock, 5125);
    assert.equal(store.getState().entries[0].purchaseTotal, 13750);
});

test('legacy lang stock and old kg receipt CSV retain the original factor without conversion', () => {
    const old = seeds(50, 'lạng');
    const rows = parseStockCsv(csv([
        ['Tên hàng', 'Giá bán', 'Số lượng', 'Đơn vị', 'Nhóm hàng', 'Đơn vị bán lẻ', 'Giá nhập 1 kg'],
        ['Hạt hướng dương', 15000, 1.5, 'kg', 'Hạt', 'lạng', 100000],
    ]));
    const plan = planStockImport(rows, [old]);
    assert.deepEqual([plan[0].stockUnit, plan[0].before, plan[0].after, plan[0].baseAdded], ['lạng', 50, 65, 15]);
    assert.equal(plan[0].productTemplate.unit, 'lạng');
    assert.equal(mapStockCsvRows(shopId, rows, [old])[0].quantity, 1.5);
    const mapped = mapProductCommand(shopId, old);
    assert.equal(mapped.p_base_unit, 'lạng');
    assert.equal(mapped.p_units[1].factor, 10);
    assert.deepEqual(saleOptions(old), [{ key: 'base', unit: 'lạng', factor: 1, price: 15000 }]);
    assert.throws(() => planStockImport(parseStockCsv(csv(stockCsvTemplate('seeds'))), [old]), /Quy cách/);
});

test('fruit gram export still imports through its kg purchase unit', () => {
    const fruit = { id: productId, name: 'Táo', stock: 1350, isActive: true,
        ...buildPricing({ ...createPricingDraft(null, 'fruit'), purchasePackPrice: '120000', retailPrice: '180000' }) };
    const rows = parseStockCsv(csv(productCsvRows([fruit])));
    assert.deepEqual(mapStockCsvRows(shopId, rows, [fruit])[0],
        { existing_product_id: productId, product: null, unit_key: 'kg', quantity: 1.35, unit_cost: 120000 });
});
