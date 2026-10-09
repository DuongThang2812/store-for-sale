import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { availableForOption, baseQuantity, buildPricing, cartKey, cartLines, createPricingDraft, formatKgFromGrams, FRUIT_COUNT_UNITS, gramsFromKg, moneyForWeight, purchaseOptions, saleOptions, stockDescription } from '../src/utils/productPricing.js';
import { createBackup, parseBackup } from '../src/utils/backup.js';
import { parseStockCsv, planStockImport, productCsvRows, stockCsvTemplate } from '../src/utils/stockCsv.js';
import { mapProduct, mapProductCommand } from '../src/mappers/productMapper.js';
import { mapStockCsvRows } from '../src/mappers/stockCsvMapper.js';
import { useCloudShopStore as cloud } from '../src/stores/useCloudShopStore.js';

function memoryStorage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), clear: () => values.clear() };
}
const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
const { useShopStore: store } = await import('../src/stores/useShopStore.js');

function fruit(stock = 10000) {
    const draft = createPricingDraft(null, 'fruit');
    draft.purchasePackPrice = '120000';
    draft.retailPrice = '180000';
    return { id: 'apple', name: 'Táo Envy', category: 'Táo', isActive: true, stock, ...buildPricing(draft) };
}
beforeEach(() => { storage.clear(); store.persist.setOptions({ name: 'fruit-shop-test' }); store.setState({ products: [fruit()], customers: [], entries: [], cart: {}, debtCarts: {} }); });

test('fruit pricing uses integer grams and a kg-priced sale unit', () => {
    const product = fruit(15500);
    assert.equal(product.unit, 'gram');
    assert.equal(product.price, 180000);
    assert.equal(product.pricing.purchasePackPrice, 120000);
    assert.equal(product.pricing.unitsPerPack, 1000);
    assert.deepEqual(saleOptions(product), [{ key: 'kg', unit: 'kg', factor: 1000, price: 180000 }]);
    assert.equal(stockDescription(product), '15,5 kg');
    assert.equal(formatKgFromGrams(1), '0,001 kg');
});

test('weight conversion and monetary rounding do not use floating point multiplication', () => {
    assert.equal(gramsFromKg('1.35'), 1350);
    assert.equal(baseQuantity(0.3, 10), 3);
    assert.equal(moneyForWeight(180000, 1350), 243000);
    assert.equal(moneyForWeight(1500, 1), 2);
    assert.throws(() => gramsFromKg('0.0005'), /đơn vị nhỏ nhất/);
    assert.throws(() => gramsFromKg('1.2345'), /đơn vị nhỏ nhất/);
});

test('1.35 kg cash sale snapshots exact kg price, line amount, and stock grams', async () => {
    const key = cartKey('apple', 'kg');
    store.getState().setQuantity(key, '1.35');
    assert.equal(store.getState().cart[key], 1350);
    assert.deepEqual(cartLines(store.getState().products, store.getState().cart).map(line => [line.quantity, line.baseQuantity, line.amount]), [[1.35, 1350, 243000]]);
    store.getState().checkout();
    const state = store.getState();
    assert.equal(state.products[0].stock, 8650);
    assert.equal(state.entries[0].amount, 243000);
    assert.deepEqual([state.entries[0].items[0].quantity, state.entries[0].items[0].unit, state.entries[0].items[0].price, state.entries[0].items[0].lineAmount], [1.35, 'kg', 180000, 243000]);
    const backup = await createBackup(state, 'fruit-owner');
    assert.equal((await parseBackup(JSON.stringify(backup))).state.products[0].stock, 8650);
    store.getState().cancelSale(state.entries[0].id, 'Khách trả hàng', true);
    assert.equal(store.getState().products[0].stock, 10000);
});

test('later stock receipt changes current cost but preserves each purchase price snapshot', () => {
    const first = fruit(10000);
    store.setState({ products: [], entries: [] });
    store.getState().saveProduct(first);
    assert.equal(store.getState().entries[0].purchasePrice, 120000);
    assert.equal(store.getState().entries[0].purchaseTotal, 1200000);
    store.getState().addStock('apple', 1.25, 'kg', 130000);
    const state = store.getState();
    assert.equal(state.products[0].stock, 11250);
    assert.equal(state.products[0].pricing.purchasePackPrice, 130000);
    assert.equal(state.entries[0].purchasePrice, 130000);
    assert.equal(state.entries[0].purchaseTotal, 162500);
    assert.equal(state.entries[1].purchasePrice, 120000);
    assert.equal(state.entries[1].purchaseTotal, 1200000);
});

test('spoiled 1.2 kg creates a movement record and rejects over-adjustment', async () => {
    store.getState().adjustFruitStock('apple', '1.2', 'spoiled', 'Bị dập');
    const state = store.getState();
    assert.equal(state.products[0].stock, 8800);
    assert.equal(state.entries[0].kind, 'adjustment');
    assert.equal(state.entries[0].quantity, 1200);
    assert.equal(state.entries[0].reason, 'spoiled');
    assert.match(state.entries[0].detail, /1,2 kg/);
    assert.throws(() => store.getState().adjustFruitStock('apple', '9', 'spoiled'), /không vượt tồn kho/);
    assert.equal(store.getState().products[0].stock, 8800);
    const backup = await createBackup(state);
    assert.equal((await parseBackup(JSON.stringify(backup))).state.entries[0].kind, 'adjustment');
});

test('fruit CSV accepts 1.35 kg and captures purchase price for the receipt', () => {
    const csv = stockCsvTemplate('fruit').map(row => row.join(',')).join('\n');
    const rows = parseStockCsv(csv);
    const plan = planStockImport(rows, []);
    assert.equal(plan[0].stockUnit, 'gram');
    assert.equal(plan[0].baseAdded, 1350);
    store.setState({ products: [], entries: [] });
    store.getState().importProducts(rows);
    const state = store.getState();
    assert.equal(state.products[0].stock, 1350);
    assert.equal(state.entries[0].purchasePrice, 120000);
    assert.equal(state.entries[0].purchaseTotal, 162000);
});

const shopId = 'fc000000-0000-4000-8000-000000000001';
const productId = 'fc000000-0000-4000-8000-000000000002';
const csv = rows => rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
function configuredFruit(unit = 'gram', stock = 2000, extras = {}) {
    return { id: productId, name: 'Trái cây thử', stock, isActive: true,
        ...buildPricing({ ...createPricingDraft(null, 'fruit'), retailUnit: unit,
            purchasePackPrice: unit === 'gram' ? '120000' : '20000', retailPrice: unit === 'gram' ? '180000' : '30000', ...extras }) };
}
function mappedProduct(product) {
    const command = mapProductCommand(shopId, product);
    return mapProduct({ id: productId, store_id: shopId, name: product.name, category: 'Táo',
        product_group: 'fruit', base_unit: command.p_base_unit, stock_base: String(product.stock), units: command.p_units,
        low_stock_threshold: String(command.p_low_stock_threshold), version: '1', is_active: true });
}
const packed = { fruitPackEnabled: true, fruitPackUnit: 'khay', fruitPackFactor: '500', fruitPackPurchasePrice: '90000', fruitPackSalePrice: '100000' };

test('all six counted fruit units use base stock and remain fruit products through DB and CSV mapping', () => {
    for (const unit of FRUIT_COUNT_UNITS) {
        const product = configuredFruit(unit, 24);
        const mapped = mappedProduct(product);
        assert.equal(mapped.unit, unit);
        assert.equal(mapped.pricing.group, 'fruit');
        assert.equal(mapped.lowStockThreshold, 5);
        assert.deepEqual(saleOptions(mapped), [{ key: 'base', unit, factor: 1, price: 30000 }]);
        assert.deepEqual(purchaseOptions(mapped), [{ key: 'base', unit, factor: 1, price: 20000 }]);
        const rows = parseStockCsv(csv(productCsvRows([product])));
        const receipt = mapStockCsvRows(shopId, rows, [])[0];
        assert.equal(receipt.product.base_unit, unit);
        assert.equal(receipt.product.units.length, 1);
        assert.deepEqual([receipt.unit_key, receipt.quantity, receipt.unit_cost], ['base', 24, 20000]);
    }
});

test('fruit kg/lang/gram/tray prices stay independent and mixed cancellation restores exact grams', async () => {
    const product = configuredFruit('gram', 2000, { ...packed, retailLangPrice: '17000', retailGramPrice: '200' });
    assert.deepEqual(saleOptions(mappedProduct(product)), saleOptions(product));
    store.setState({ products: [product] });
    for (const [key, quantity] of [['kg', 0.5], ['lang', 1], ['base', 20], ['pack', 1]]) store.getState().setQuantity(cartKey(productId, key), quantity);
    store.getState().setQuantity(cartKey(productId, 'pack'), 0.5);
    assert.equal(store.getState().cart[cartKey(productId, 'pack')], 500);
    store.getState().checkout();
    assert.equal(store.getState().products[0].stock, 880);
    assert.equal(store.getState().entries[0].amount, 211000);
    const snapshot = await parseBackup(JSON.stringify(await createBackup(store.getState())));
    assert.equal(snapshot.state.entries[0].items.length, 4);
    store.getState().cancelSale(store.getState().entries[0].id, 'Trả toàn bộ hàng', true);
    assert.equal(store.getState().products[0].stock, 2000);
});

test('fruit piece/carton mixed sale counts pieces and preserves price snapshots in backup', async () => {
    const product = configuredFruit('quả', 24, { ...packed, fruitPackUnit: 'thùng', fruitPackFactor: '12', fruitPackPurchasePrice: '240000', fruitPackSalePrice: '320000' });
    store.setState({ products: [product] });
    store.getState().setQuantity(cartKey(productId, 'pack'), 1);
    store.getState().setQuantity(productId, 2);
    store.getState().checkout();
    assert.equal(store.getState().products[0].stock, 10);
    assert.equal(store.getState().entries[0].amount, 380000);
    assert.equal((await parseBackup(JSON.stringify(await createBackup(store.getState())))).state.products[0].unit, 'quả');
    store.getState().cancelSale(store.getState().entries[0].id, 'Trả hàng', true);
    assert.equal(store.getState().products[0].stock, 24);
});

test('a weighted fruit tray receipt keeps its per-tray cost without changing the kg purchase quote', () => {
    const product = configuredFruit('gram', 2000, packed);
    store.setState({ products: [product] });
    store.getState().addStock(productId, 2, 'pack', 95000);
    const state = store.getState();
    assert.equal(state.products[0].stock, 3000);
    assert.equal(state.products[0].pricing.purchasePackPrice, 120000);
    assert.equal(state.products[0].pricing.fruitPack.purchasePrice, 95000);
    assert.deepEqual([state.entries[0].purchasePrice, state.entries[0].purchaseTotal, state.entries[0].importUnit], [95000, 190000, 'khay']);
});

test('CSV preserves fruit extra units and uses entered tray receipt quantity and cost', () => {
    const product = configuredFruit('gram', 2000, { ...packed, retailLangPrice: '17000', retailGramPrice: '200' });
    const source = productCsvRows([product]);
    source[1][source[0].indexOf('Còn lại')] = 2;
    source[1][source[0].indexOf('Đơn vị')] = 'khay';
    source[1][source[0].indexOf('Giá nhập')] = 95000;
    const rows = parseStockCsv(csv(source));
    const receipt = mapStockCsvRows(shopId, rows, [])[0];
    assert.deepEqual([receipt.unit_key, receipt.quantity, receipt.unit_cost], ['pack', 2, 95000]);
    assert.equal(receipt.product.units.find(unit => unit.key === 'kg').purchase_price, 120000);
    store.getState().importProducts(rows);
    const state = store.getState();
    const imported = state.products.find(item => item.name === product.name);
    assert.equal(imported.stock, 1000);
    assert.equal(state.entries[0].purchaseTotal, 190000);
});

test('counted-fruit CSV preserves base quote when receipt cost is per carton', () => {
    const product = configuredFruit('quả', 24, { ...packed, fruitPackUnit: 'thùng', fruitPackFactor: '12', fruitPackPurchasePrice: '240000', fruitPackSalePrice: '320000' });
    const source = productCsvRows([product]);
    source[1][source[0].indexOf('Còn lại')] = 2;
    source[1][source[0].indexOf('Đơn vị')] = 'thùng';
    source[1][source[0].indexOf('Giá nhập')] = 230000;
    const receipt = mapStockCsvRows(shopId, parseStockCsv(csv(source)), [])[0];
    assert.deepEqual([receipt.unit_key, receipt.quantity, receipt.unit_cost], ['pack', 2, 230000]);
    assert.equal(receipt.product.units.find(unit => unit.key === 'base').purchase_price, 20000);
});

test('cloud gram/carton draft keys share stock and counted units cannot accept fractions', () => {
    const product = configuredFruit('gram', 2000, { ...packed, retailGramPrice: '200' });
    cloud.setState({ storeId: shopId, products: [product], cart: {}, customers: [], debtCarts: {} });
    cloud.getState().setQuantity(productId, 1100);
    const option = saleOptions(product).find(unit => unit.key === 'pack');
    assert.equal(availableForOption(product, option, cloud.getState().cart), 1);
    cloud.getState().setQuantity(cartKey(productId, 'pack'), 2);
    cloud.getState().setQuantity(cartKey(productId, 'pack'), 0.5);
    assert.equal(cloud.getState().cart[cartKey(productId, 'pack')], 500);
    cloud.getState().setQuantity(cartKey(productId, 'kg'), 1);
    assert.equal(cloud.getState().cart[cartKey(productId, 'kg')], 400);
    assert.equal(cloud.getState().products[0].stock, 2000);
});

test('fruit pricing rejects ambiguous units and CSV cannot mutate packed conversion', () => {
    assert.throws(() => configuredFruit('kg'), /Chọn cân/);
    assert.throws(() => configuredFruit('quả', 24, { ...packed, fruitPackUnit: 'quả' }), /khác đơn vị/);
    const product = configuredFruit('gram', 2000, packed);
    const source = productCsvRows([product]);
    const extra = source[0].indexOf('Quy cách trái cây');
    source[1][extra] = JSON.stringify({ fruitPack: { ...product.pricing.fruitPack, factor: 600 } });
    assert.throws(() => planStockImport(parseStockCsv(csv(source)), [product]), /Quy cách đóng gói/);
    source[1][extra] = '{"__proto__":{}}';
    assert.throws(() => parseStockCsv(csv(source)), /trường không hợp lệ/);
});

test('fruit pack purchase/sale flags survive DB and CSV round trips without inventing prices', () => {
    for (const permission of ['fruitPackCanPurchase', 'fruitPackCanSell']) {
        const product = configuredFruit('gram', 2000, { ...packed, [permission]: false });
        const mapped = mappedProduct(product);
        assert.deepEqual(saleOptions(mapped), saleOptions(product));
        assert.deepEqual(purchaseOptions(mapped), purchaseOptions(product));
        const rows = parseStockCsv(csv(productCsvRows([product])));
        assert.deepEqual(rows[0].productTemplate.pricing.fruitPack, product.pricing.fruitPack);
    }
    assert.throws(() => configuredFruit('gram', 2000, { ...packed, fruitPackCanPurchase: false, fruitPackCanSell: false }), /nhập hoặc bán/);
});

test('legacy fruit kg stored under pack retains its key when editing and adding another package', () => {
    const product = configuredFruit();
    const command = mapProductCommand(shopId, product);
    command.p_units[1].key = 'pack';
    const mapped = mapProduct({ id: productId, store_id: shopId, name: product.name, category: 'Táo',
        product_group: 'fruit', base_unit: 'gram', stock_base: '2000', units: command.p_units,
        low_stock_threshold: '5000', version: '1', is_active: true });
    assert.equal(saleOptions(mapped)[0].key, 'pack');
    const edited = { ...mapped, ...buildPricing({ ...createPricingDraft(mapped), ...packed }) };
    const next = mapProductCommand(shopId, edited, productId);
    assert.deepEqual(next.p_units.map(unit => [unit.key, unit.name]), [['base', 'gram'], ['pack', 'kg'], ['fruit_pack', 'khay']]);
    assert.equal(next.p_opening_stock, 0);
});

test('custom shop categories survive CSV imports independently of pricing group', () => {
    const grocery = { name: 'Nước thử', stock: 24, isActive: true, ...buildPricing({ ...createPricingDraft(null, 'drinks'),
        packSize: '24', purchasePackPrice: '180000', retailPackPrice: '225000', retailPrice: '10000' }), category: 'Nước nhập khẩu' };
    const counted = { ...configuredFruit('hộp', 4), category: 'Trái cây nhập khẩu' };
    for (const product of [grocery, counted]) {
        const source = productCsvRows([product]);
        if (product.pricing.group === 'drinks') {
            source[1][source[0].indexOf('Đơn vị')] = 'thùng';
            source[1][source[0].indexOf('Còn lại')] = 1;
        }
        const rows = parseStockCsv(csv(source));
        const receipt = mapStockCsvRows(shopId, rows, [])[0];
        assert.equal(receipt.product.category, product.category);
        assert.equal(receipt.product.product_group, product.pricing.group);
        assert.equal(rows[0].productTemplate.category, product.category);
    }
});
