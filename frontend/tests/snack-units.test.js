import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { buildPricing, createPricingDraft, saleOptions, purchaseOptions, validateProductPricing, cartKey, cartLines,
    availableForOption, pricingWithPurchaseCost } from '../src/utils/productPricing.js';
import { mapProduct, mapProductCommand } from '../src/mappers/productMapper.js';
import { mapSaleCommand } from '../src/mappers/transactionMapper.js';
import { parseStockCsv, productCsvRows, stockCsvTemplate, planStockImport } from '../src/utils/stockCsv.js';
import { mapStockCsvRows } from '../src/mappers/stockCsvMapper.js';
import { createBackup, parseBackup } from '../src/utils/backup.js';
import { useCloudShopStore as cloud } from '../src/stores/useCloudShopStore.js';

const saved = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)), removeItem: key => saved.delete(key),
} });
const { useShopStore: demo } = await import('../src/stores/useShopStore.js');
const shopId = 'fa100000-0000-4000-8000-000000000001';
const productId = 'fa100000-0000-4000-8000-000000000002';
const requestId = 'fa100000-0000-4000-8000-000000000003';
const encodeCsv = rows => rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
function snack() {
    return { id: productId, name: 'Kẹo bốn cấp', stock: 8000, isActive: true, ...buildPricing({
        ...createPricingDraft(null, 'snacks'), retailUnit: 'viên', bagsPerPack: '20', unitsPerBag: '200',
        purchasePackPrice: '600000', purchaseBagPrice: '30000', retailPrice: '1000', retailBagPrice: '40000', retailPackPrice: '700000',
        additionalUnits: [{ key: 'packet', unit: 'gói', factor: '20', purchasePrice: '3000', salePrice: '5000', canPurchase: true, canSell: true }],
    }) };
}
beforeEach(() => {
    saved.clear(); demo.persist.setOptions({ name: 'snack-units-test' });
    demo.setState({ products: [snack()], cart: {}, debtCarts: {}, entries: [], customers: [] });
});

test('four snack levels keep independent prices and one base stock through DB round trip', () => {
    const product = snack();
    assert.deepEqual(saleOptions(product).map(unit => [unit.key, unit.unit, unit.factor, unit.price]), [
        ['base', 'viên', 1, 1000], ['pack', 'thùng', 4000, 700000], ['bag', 'bịch', 200, 40000], ['packet', 'gói', 20, 5000],
    ]);
    const command = mapProductCommand(shopId, product);
    assert.equal(command.p_units.length, 4);
    const mapped = mapProduct({ id: productId, store_id: shopId, name: product.name, category: product.category,
        product_group: 'snacks', base_unit: 'viên', stock_base: '8000', low_stock_threshold: '5', is_active: true, version: '1',
        units: command.p_units.map(unit => ({ ...unit, id: unit.key })) });
    assert.deepEqual(saleOptions(mapped), saleOptions(product));
    assert.deepEqual(purchaseOptions(mapped), purchaseOptions(product));
    assert.doesNotThrow(() => validateProductPricing(mapped));
    assert.deepEqual(mapProductCommand(shopId, mapped).p_units, command.p_units);
});

test('mixed carton/bag/packet/piece cash sale and cancellation use exact snapshots', async () => {
    for (const [key, quantity] of [['pack', 1], ['bag', 2], ['packet', 3], ['base', 5]]) demo.getState().setQuantity(cartKey(productId, key), quantity);
    const lines = cartLines(demo.getState().products, demo.getState().cart);
    assert.equal(lines.reduce((sum, line) => sum + line.baseQuantity, 0), 4465);
    assert.equal(lines.reduce((sum, line) => sum + line.amount, 0), 800000);
    demo.getState().checkout();
    assert.equal(demo.getState().products[0].stock, 3535);
    assert.equal(demo.getState().entries[0].amount, 800000);
    const backup = await createBackup(demo.getState());
    assert.equal((await parseBackup(JSON.stringify(backup))).state.products[0].pricing.additionalUnits[0].factor, 20);
    const saleId = demo.getState().entries[0].id;
    demo.getState().cancelSale(saleId, 'Khách trả hàng', true);
    assert.equal(demo.getState().products[0].stock, 8000);
    assert.throws(() => demo.getState().cancelSale(saleId, 'Khách trả hàng', true), /đã hủy/);
});

test('all snack units share stock caps in demo and cloud draft carts', () => {
    const product = { ...snack(), stock: 445 };
    const packet = saleOptions(product).find(unit => unit.key === 'packet');
    assert.equal(availableForOption(product, packet, { [cartKey(productId, 'bag')]: 2 }), 2);
    for (const store of [demo, cloud]) {
        store.setState({ products: [product], cart: {}, debtCarts: {} });
        store.getState().setQuantity(cartKey(productId, 'bag'), 2);
        store.getState().setQuantity(cartKey(productId, 'packet'), 10);
        store.getState().setQuantity(productId, 10);
        const lines = cartLines(store.getState().products, store.getState().cart);
        assert.equal(lines.reduce((sum, line) => sum + line.baseQuantity, 0), 445);
    }
});

test('five optional snack levels preserve separate buying and selling roles', () => {
    const draft = createPricingDraft(snack());
    const product = { ...snack(), ...buildPricing({ ...draft, additionalUnits: [...draft.additionalUnits,
        { key: 'pair', unit: 'cái', factor: '2', purchasePrice: '', salePrice: '1800', canPurchase: false, canSell: true }] }) };
    assert.equal(saleOptions(product).length, 5);
    assert.equal(purchaseOptions(product).length, 3);
    const command = mapProductCommand(shopId, product);
    assert.equal(command.p_units.find(unit => unit.key === 'pair').purchase_price, null);
    assert.equal(command.p_units.find(unit => unit.key === 'pair').can_purchase, false);
    assert.equal(command.p_units.find(unit => unit.key === 'pair').factor, 2);
});

test('packet receipt updates only packet purchase price and snapshots per-packet cost', () => {
    demo.getState().addStock(productId, 5, 'packet', 2500);
    const state = demo.getState();
    assert.equal(state.products[0].stock, 8100);
    assert.equal(state.products[0].pricing.additionalUnits[0].purchasePrice, 2500);
    assert.equal(state.products[0].pricing.purchasePackPrice, 600000);
    assert.equal(state.entries[0].purchaseTotal, 12500);
    assert.equal(state.entries[0].importUnit, 'gói');
    assert.equal(pricingWithPurchaseCost(snack(), 'bag', 31000).purchaseBagPrice, 31000);
});

test('snack CSV exports all prices and units and imports packet receipts atomically as intent', () => {
    const rows = productCsvRows([snack()]);
    rows[1][rows[0].indexOf('Còn lại')] = 5;
    rows[1][rows[0].indexOf('Đơn vị')] = 'gói';
    rows[1][rows[0].indexOf('Giá nhập')] = 2500;
    const parsed = parseStockCsv(encodeCsv(rows));
    assert.equal(parsed[0].snackUnitsDeclaration, true);
    assert.deepEqual(saleOptions(parsed[0].productTemplate), saleOptions(snack()));
    const command = mapStockCsvRows(shopId, parsed, []);
    assert.equal(command[0].unit_key, 'packet');
    assert.equal(command[0].quantity, 5);
    assert.equal(command[0].unit_cost, 2500);
    assert.equal(command[0].product.units.length, 4);
    assert.equal(Object.hasOwn(command[0], 'after'), false);
    demo.getState().importProducts(parsed);
    assert.equal(demo.getState().products[0].stock, 8100);
    assert.equal(demo.getState().entries[0].purchaseTotal, 12500);
    demo.setState({ products: [], entries: [] });
    demo.getState().importProducts(parsed);
    assert.equal(demo.getState().products[0].pricing.additionalUnits[0].purchasePrice, 2500);
});

test('CSV cannot mutate extra conversion and older files keep existing extra units', () => {
    const rows = productCsvRows([snack()]);
    rows[1][rows[0].indexOf('Đơn vị')] = 'thùng';
    rows[1][rows[0].indexOf('Còn lại')] = 1;
    const extrasIndex = rows[0].indexOf('Quy cách bánh kẹo');
    const extras = JSON.parse(rows[1][extrasIndex]);
    extras.additionalUnits[0].factor = 30;
    rows[1][extrasIndex] = JSON.stringify(extras);
    assert.throws(() => planStockImport(parseStockCsv(encodeCsv(rows)), [snack()]), /Quy cách bánh kẹo/);
    rows[1][extrasIndex] = '';
    assert.equal(mapStockCsvRows(shopId, parseStockCsv(encodeCsv(rows)), [snack()])[0].unit_key, 'pack');
});

test('legacy snack template keeps only base retail sale and pack/bag purchases', () => {
    const parsed = parseStockCsv(encodeCsv(stockCsvTemplate('snacks')));
    assert.deepEqual(saleOptions(parsed[0].productTemplate).map(unit => unit.key), ['base']);
    assert.deepEqual(purchaseOptions(parsed[0].productTemplate).map(unit => unit.key), ['pack', 'bag']);
    assert.equal(mapStockCsvRows(shopId, parsed, [])[0].unit_key, 'pack');
    const bagRows = stockCsvTemplate('snacks');
    bagRows[1][bagRows[0].indexOf('Đơn vị')] = 'bịch';
    assert.equal(mapStockCsvRows(shopId, parseStockCsv(encodeCsv(bagRows)), [])[0].unit_key, 'bag');
    assert.equal(mapStockCsvRows(shopId, parseStockCsv(encodeCsv(bagRows)), [])[0].unit_cost, 20000);
});

test('retail import price enables optional piece receipts without inventing prices', () => {
    const product = { ...snack(), ...buildPricing({ ...createPricingDraft(snack()), purchaseRetailPrice: '150' }) };
    assert.equal(mapProductCommand(shopId, product).p_units[0].can_purchase, true);
    assert.equal(purchaseOptions(product).find(unit => unit.key === 'base').price, 150);
    const rows = productCsvRows([product]);
    rows[1][rows[0].indexOf('Còn lại')] = 10;
    assert.equal(mapStockCsvRows(shopId, parseStockCsv(encodeCsv(rows)), [])[0].unit_cost, 150);
    assert.throws(() => mapStockCsvRows(shopId, parseStockCsv(encodeCsv(productCsvRows([snack()]))), []), /đơn vị nhập/);
});

test('extra unit roles, keys, names, money and factors are validated before DB writes', () => {
    const draft = createPricingDraft(snack());
    for (const patch of [{ key: 'pack' }, { unit: 'bịch' }, { factor: '0' }, { factor: '0.5' },
        { salePrice: '9007199254740993' }, { canSell: false, canPurchase: false }, { canSell: 'true' }, { arbitrary: 'secret' }]) {
        assert.throws(() => buildPricing({ ...draft, additionalUnits: [{ ...draft.additionalUnits[0], ...patch }] }));
    }
    assert.throws(() => buildPricing({ ...draft, additionalUnits: [...draft.additionalUnits, ...draft.additionalUnits] }), /trùng/);
    const purchaseOnly = buildPricing({ ...draft, additionalUnits: [{ ...draft.additionalUnits[0], canSell: false }] });
    assert.equal(saleOptions(purchaseOnly).some(unit => unit.key === 'packet'), false);
    assert.equal(purchaseOptions(purchaseOnly).some(unit => unit.key === 'packet'), true);
});

test('demo refuses changed or removed packet conversions while stock or carts exist', () => {
    const altered = { ...snack(), pricing: { ...snack().pricing,
        additionalUnits: [{ ...snack().pricing.additionalUnits[0], factor: 30 }] } };
    assert.throws(() => demo.getState().saveProduct(altered), /còn tồn kho/);
    demo.setState({ products: [{ ...snack(), stock: 0 }], cart: { [cartKey(productId, 'packet')]: 1 } });
    assert.throws(() => demo.getState().saveProduct({ ...snack(), stock: 0, pricing: { ...snack().pricing, additionalUnits: [] } }), /trong giỏ/);
});

test('multi-unit sale payload includes intent only and preserves all chosen unit keys', () => {
    const command = mapSaleCommand(shopId, { requestId, items: ['pack', 'bag', 'packet', 'base'].map(unitKey => ({
        productId, unitKey, quantity: 1, price: 0, total: 0, finalStock: 99999,
    })) });
    assert.deepEqual(command.p_items.map(item => Object.keys(item)), Array(4).fill(['product_id', 'unit_key', 'quantity']));
});
