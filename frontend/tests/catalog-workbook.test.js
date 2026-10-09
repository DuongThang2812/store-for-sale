import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalogWorkbook, planCatalogDraftImport } from '../src/utils/catalogWorkbook.js';
import { validateSnapshot } from '../src/utils/backup.js';

const header = ['Mã nguồn', 'Tên hàng', 'Giá nhập gốc', 'Giá nhập tham khảo (đ)', 'Đơn vị giá nhập', 'Giá bậc / khuyến mãi', 'Tình trạng nguồn', 'Giá bán lẻ (đ)', 'Đơn vị bán lẻ', 'Ghi chú rà soát', 'Dòng gốc'];
const sheet = (rows, name = 'Nước ngọt') => [{ sheet: name, data: [[], [], [], [], [...header], ...rows.map((item, index) => [`G${String(index + 1).padStart(4, '0')}`, ...item.slice(1)])] }];
const row = (name, price = null, sale = null) => ['G0001', name, '168 50t 167', price, 'thùng', '50t 167', 'Chưa xác nhận', sale, 'lon', 'Cần rà soát', `${name} 168 50t 167`];

test('catalog import keeps purchase quotes separate from sale price and inventory', () => {
    const records = parseCatalogWorkbook(sheet([row('Sting nho lon', 168000), row('Coca lon', 171000, 12000)]));
    const plan = planCatalogDraftImport(records, []);
    assert.equal(plan.create.length, 2);
    assert.equal(plan.create[0].supplierQuote.purchasePrice, 168000);
    assert.equal(plan.create[0].price, 0);
    assert.equal(plan.create[1].price, 12000);
    assert.ok(plan.create.every(product => product.stock === 0 && product.isActive === false));
    assert.equal(validateSnapshot({ products: plan.create.map((product, index) => ({ ...product, id: `draft-${index}` })), customers: [], entries: [], cart: {}, debtCarts: {} }).products.length, 2);
});

test('catalog import never replaces an existing product and skips duplicate names', () => {
    const existing = { id: 'existing', name: 'Sting nho lon', price: 12000, stock: 12, unit: 'lon', isActive: true };
    const records = parseCatalogWorkbook(sheet([row('Sting nho lon', 168000), row('Coca lon', 171000), row(' coca   lon ', 172000)]));
    const plan = planCatalogDraftImport(records, [existing]);
    assert.equal(plan.skipped, 2);
    assert.equal(plan.create.length, 1);
    assert.equal(existing.stock, 12);
    assert.equal(existing.price, 12000);
});

test('catalog rejects modified headers, unsupported units and invalid money', () => {
    const wrongHeader = sheet([row('Sting')]);
    wrongHeader[0].data[4][1] = 'Sản phẩm';
    assert.throws(() => parseCatalogWorkbook(wrongHeader), /đổi tên hoặc thứ tự cột/);
    const wrongUnit = row('Sting'); wrongUnit[8] = 'lốc';
    assert.throws(() => parseCatalogWorkbook(sheet([wrongUnit])), /Đơn vị bán lẻ/);
    assert.throws(() => parseCatalogWorkbook(sheet([row('Sting', -1)])), /Giá nhập tham khảo/);
});
