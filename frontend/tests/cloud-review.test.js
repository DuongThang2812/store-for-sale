import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestJournal } from '../src/services/requestJournal.js';
import { createCloudCommandRunner } from '../src/services/cloudCommandRunner.js';
import { createSalesService } from '../src/services/salesService.js';
import { createProductService } from '../src/services/productService.js';
import { createInventoryService } from '../src/services/inventoryService.js';
import { createActivityService } from '../src/services/activityService.js';
import { parseStockCsv, stockCsvTemplate } from '../src/utils/stockCsv.js';
import { mapStockCsvRows } from '../src/mappers/stockCsvMapper.js';
import { createShopSettingsService } from '../src/services/shopSettingsService.js';
import { mapStoreMembership } from '../src/mappers/storeMapper.js';
import { canUseShopOperation } from '../src/domain/shopPermissions.js';

const shop = 'fa000000-0000-4000-8000-000000000001';
const product = 'fa000000-0000-4000-8000-000000000002';
const request = 'fa000000-0000-4000-8000-000000000003';
function storage() {
    const rows = new Map();
    return { rows, getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) };
}
const csv = rows => rows.map(row => row.join(',')).join('\n');

test('staff permissions are explicit, role scoped and versioned without unsafe bigint conversion', () => {
    const membership = { role: 'staff', can_sell: true, can_receive_stock: false, can_manage_debt: true,
        permission_version: '3', stores: { id: shop, status: 'active', settings_version: '2', contact_phone: '0900' } };
    const staff = mapStoreMembership(membership);
    assert.equal(staff.permissionVersion, 3);
    assert.equal(staff.settingsVersion, 2);
    assert.equal(staff.phone, '0900');
    assert.equal(canUseShopOperation(staff, 'sell'), true);
    assert.equal(canUseShopOperation(staff, 'receiveStock'), false);
    assert.equal(canUseShopOperation(staff, 'manageDebt'), true);
    assert.equal(canUseShopOperation(staff, 'manageShop'), false);
    assert.equal(canUseShopOperation({ ...staff, memberActive: false }, 'sell'), false);
    assert.equal(canUseShopOperation({ ...staff, status: 'suspended' }, 'sell'), false);
    assert.equal(canUseShopOperation(mapStoreMembership({ stores: membership.stores, role: 'staff' }), 'sell'), false);
    const owner = mapStoreMembership({ ...membership, role: 'owner' });
    assert.equal(canUseShopOperation(owner, 'manageShop'), true);
    assert.equal(canUseShopOperation(owner, 'transferOwnership'), false);
    assert.throws(() => mapStoreMembership({ ...membership, permission_version: '9007199254740993' }), /an toàn/);
    assert.throws(() => mapStoreMembership({ ...membership, stores: { ...membership.stores, settings_version: 0 } }), /an toàn/);
});

test('new staff defaults to cash sales and sends one idempotent permission RPC', async () => {
    const calls = [];
    const service = createShopSettingsService(() => ({ rpc: async (name, params) => {
        calls.push({ name, params }); return { data: { user_id: product }, error: null };
    } }));
    const intent = { requestId: request, email: ' Staff@Example.invalid ', role: 'owner', currentDebt: 999 };
    await service.saveStaff(shop, intent);
    await service.saveStaff(shop, intent);
    assert.deepEqual(calls[0], calls[1]);
    assert.deepEqual(calls[0], { name: 'save_store_staff', params: {
        p_store_id: shop, p_request_id: request, p_email: 'staff@example.invalid', p_user_id: null,
        p_expected_version: null, p_can_sell: true, p_can_receive_stock: false, p_can_manage_debt: false, p_is_active: true,
    } });
    assert.throws(() => service.saveStaff(shop, { ...intent, canManageDebt: 'true' }), /Quyền nhân viên/);
    assert.throws(() => service.saveStaff(shop, { ...intent, email: 'bad-email' }), /Email/);
    assert.throws(() => service.saveStaff(shop, { ...intent, requestId: null }), /UUID/);
    assert.equal(calls.length, 2);
});

test('staff edits require the observed version and allow debt collection separately from selling', async () => {
    const calls = [];
    const service = createShopSettingsService(() => ({ rpc: async (name, params) => {
        calls.push({ name, params }); return { data: {}, error: null };
    } }));
    const intent = { requestId: request, userId: product, canSell: false, canReceiveStock: true, canManageDebt: true, isActive: false };
    assert.throws(() => service.saveStaff(shop, intent), /Phiên bản quyền/);
    await service.saveStaff(shop, { ...intent, expectedVersion: 4 });
    assert.equal(calls[0].params.p_expected_version, 4);
    assert.equal(calls[0].params.p_can_sell, false);
    assert.equal(calls[0].params.p_can_manage_debt, true);
    assert.equal(calls[0].params.p_is_active, false);
    assert.equal(calls[0].params.p_email, null);
    assert.throws(() => service.listStaff(shop, { limit: 101 }), /Phân trang/);
    await service.listStaff(shop, { offset: 30 });
    assert.deepEqual(calls[1], { name: 'list_store_staff', params: { p_store_id: shop, p_offset: 30, p_limit: 30 } });
});

test('shop settings write only editable fields with a version; RPC denial is preserved', async () => {
    let payload;
    const denied = { code: '42501', message: 'Owner only' };
    const service = createShopSettingsService(() => ({ rpc: async (name, params) => {
        payload = { name, params }; return { data: null, error: denied };
    } }));
    await assert.rejects(service.saveSettings(shop, { requestId: request, name: ' BIN ', phone: ' 0900 ', address: '  ', expectedVersion: 2,
        businessType: 'fruit_shop', timezone: 'UTC', stock: 100 }), error => error.cause === denied && error.code === denied.code && error.applicationCode === 'FORBIDDEN');
    assert.deepEqual(payload, { name: 'save_store_settings', params: {
        p_store_id: shop, p_request_id: request, p_name: 'BIN', p_contact_phone: '0900', p_address: null, p_expected_version: 2,
    } });
    assert.throws(() => service.saveSettings(shop, { requestId: request, name: 'BIN', expectedVersion: 0 }), /Phiên bản cài đặt/);
});

test('settings response from an earlier session cannot mutate the same user after signing in again', async () => {
    let user = { id: 'owner' };
    const context = () => ({ actorId: user.id, storeId: shop, scope: user });
    let reloads = 0;
    const run = createCloudCommandRunner({ context, journal: createRequestJournal(storage()) });
    await assert.rejects(run(shop, 'settings', { name: 'BIN' }, async () => {
        user = { id: 'owner' }; // Same UUID, new verified session.
        return {};
    }, async () => { reloads += 1; }), /Phiên hoặc cửa hàng đã đổi/);
    assert.equal(reloads, 0);
});

test('request journal survives page reload, isolates intent and stores no business payload', async () => {
    const saved = storage();
    const first = createRequestJournal(saved);
    const intent = `${shop}:Cô Lan:pay:50000`;
    const [a, b] = await Promise.all([first.obtain(intent), first.obtain(intent)]);
    assert.equal(a.requestId, b.requestId);
    const second = createRequestJournal(saved);
    assert.equal((await second.obtain(intent)).requestId, a.requestId);
    assert.notEqual((await second.obtain(`${intent}:different-user`)).requestId, a.requestId);
    assert.ok([...saved.rows.entries()].every(([key, value]) => !key.includes('Cô Lan') && !value.includes('50000')));
    second.complete(a.key);
    assert.notEqual((await createRequestJournal(saved).obtain(intent)).requestId, a.requestId);
});

test('failed post-commit reload retains request ID until the same operation is reconciled', async () => {
    const ids = [];
    const run = createCloudCommandRunner({ context: () => ({ actorId: 'owner', storeId: shop, scope: 1 }), journal: createRequestJournal(storage()) });
    const perform = async id => { ids.push(id); return { receiptId: product }; };
    await assert.rejects(run(shop, 'receipt', { quantity: 2 }, perform, async () => { throw new Error('offline after commit'); }), /offline/);
    const result = await run(shop, 'receipt', { quantity: 2 }, perform, async () => {});
    assert.equal(ids[0], ids[1]);
    assert.equal(result.receiptId, product);
    await run(shop, 'receipt', { quantity: 2 }, perform, async () => {});
    assert.notEqual(ids[1], ids[2]);
});

test('late command response after logout never reloads or reports success in the new scope', async () => {
    let context = { actorId: 'owner', storeId: shop, scope: 1 };
    let reloads = 0;
    const run = createCloudCommandRunner({ context: () => context, journal: createRequestJournal(storage()) });
    await assert.rejects(run(shop, 'sale', {}, async () => {
        context = { actorId: null, storeId: null, scope: 2 };
        return { totalAmount: 10000 };
    }, async () => { reloads += 1; }), /Phiên hoặc cửa hàng đã đổi/);
    assert.equal(reloads, 0);
});

test('cloud cancellation requires server preview and sends one atomic idempotent command', async () => {
    const calls = [];
    const service = createSalesService(() => ({ rpc: async (name, params) => { calls.push({ name, params }); return { data: {}, error: null }; } }));
    assert.throws(() => service.cancelSale(shop, { saleId: product, reason: 'Nhầm hàng', requestId: request }), /mở lại/);
    await service.previewCancellation(shop, product);
    await service.cancelSale(shop, { saleId: product, reason: 'Nhầm hàng', requestId: request, previewToken: 'a'.repeat(64), refundAmount: 999 });
    assert.equal(calls[1].name, 'cancel_sale_confirmed');
    assert.equal(calls[1].params.p_request_id, request);
    assert.equal(calls[1].params.p_preview_token, 'a'.repeat(64));
    assert.equal('refundAmount' in calls[1].params, false);
});

test('reviewed checkout sends observed version, never client price or total', async () => {
    let payload;
    await createSalesService(() => ({ rpc: async (name, params) => { payload = { name, params }; return { data: {}, error: null }; } }))
        .createSale(shop, { requestId: request, totalAmount: 999, items: [{ productId: product, unitKey: 'base', quantity: 2, expectedVersion: 4, price: 1 }] });
    assert.equal(payload.name, 'create_sale_reviewed');
    assert.deepEqual(payload.params.p_items, [{ product_id: product, unit_key: 'base', quantity: 2, expected_version: 4 }]);
    assert.equal('totalAmount' in payload.params, false);
});

test('product edit carries version and no stock mutation; inventory count rejects missing version', async () => {
    let payload;
    const provider = () => ({ rpc: async (name, params) => { payload = { name, params }; return { data: product, error: null }; } });
    await createProductService(provider).save(shop, { name: 'Test', unit: 'lon', price: 10000, stock: 99, version: 4 }, product, request);
    assert.equal(payload.name, 'save_product_idempotent');
    assert.equal(payload.params.p_product.expected_version, 4);
    assert.equal(payload.params.p_product.p_opening_stock, 0);
    assert.equal(payload.params.p_product.p_units[0].can_purchase, true);
    assert.throws(() => createInventoryService(provider).countStock(shop, { requestId: request, items: [{ productId: product, actualBase: 2 }] }), /Phiên bản/);
});

test('all CSV templates carry explicit unit cost, fractional fruit stays kg and server calculates stock', () => {
    for (const group of ['snacks','drinks','beer','spices','seeds','tobacco','fruit']) {
        const rows = parseStockCsv(csv(stockCsvTemplate(group)));
        const [mapped] = mapStockCsvRows(shop, rows, []);
        assert.ok(Number.isSafeInteger(mapped.unit_cost));
        assert.ok(mapped.unit_cost > 0);
        assert.equal('balance_after' in mapped, false);
        if (group === 'fruit') { assert.equal(mapped.quantity, 1.35); assert.equal(mapped.unit_key, 'kg'); }
    }
    const rows = parseStockCsv('Tên hàng,Giá bán,Số lượng,Đơn vị\nHàng mới,10000,2,lon');
    assert.throws(() => mapStockCsvRows(shop, rows, []), /cần ghi giá nhập/);
});

test('history pagination scopes filters in server and never invents hidden purchase amounts', async () => {
    let parameters;
    const service = createActivityService(() => ({ rpc: async (_, params) => {
        parameters = params;
        return { data: { events: [{ id: 'receipt', kind: 'stock', amount: 0, items: [{ product_id: product, quantity: 1, unit: 'lon', name: 'Hàng', price: null, line_amount: null }] }], has_more: true, next_offset: 100 }, error: null };
    } }));
    const result = await service.page(shop, { offset: 50, limit: 50, customerId: product, kind: 'stock' });
    assert.equal(parameters.p_customer_id, product);
    assert.equal(parameters.p_offset, 50);
    assert.equal(result.hasMore, true);
    assert.equal(result.entries[0].items[0].price, undefined);
    assert.equal(result.entries[0].purchaseTotal, undefined);
});
