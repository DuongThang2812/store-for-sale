import test from 'node:test';
import assert from 'node:assert/strict';
import { readSupabaseConfig } from '../src/lib/supabaseConfig.js';
import { getSupabaseConfigurationStatus } from '../src/lib/supabase.js';
import { createAuthService } from '../src/services/authService.js';
import { createStoreService } from '../src/services/storeService.js';
import { createSupabaseShopRepository } from '../src/repositories/supabaseShopRepository.js';
import { createShopRepository } from '../src/repositories/shopRepository.js';
import { createDemoShopRepository } from '../src/repositories/demoShopRepository.js';
import { mapProduct, mapProductCommand, mapUnitToDatabase } from '../src/mappers/productMapper.js';
import { mapSaleCommand } from '../src/mappers/transactionMapper.js';
import { toSafeInteger } from '../src/mappers/numberMapper.js';
import { mapCustomer } from '../src/mappers/customerMapper.js';
import { createReportService } from '../src/services/reportService.js';
import { createCategoryService } from '../src/services/categoryService.js';
import { createSupplierService } from '../src/services/supplierService.js';
import { createInventoryService } from '../src/services/inventoryService.js';

const storeId = '10000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000001';
const customerId = '30000000-0000-4000-8000-000000000001';
const requestId = '40000000-0000-4000-8000-000000000001';
const userId = '50000000-0000-4000-8000-000000000001';
const env = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
const jwt = role => `e30.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

function fakeClient({ rows = [], error = null, rpcData = {}, user = { id: userId } } = {}) {
    const calls = [];
    return {
        calls,
        auth: { getUser: async () => ({ data: { user }, error: null }) },
        from(table) {
            calls.push(['from', table]);
            const query = {};
            for (const method of ['select', 'eq', 'order', 'range']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
            query.maybeSingle = async () => ({ data: rows[0] ?? null, error });
            query.then = (resolve, reject) => Promise.resolve({ data: rows, error }).then(resolve, reject);
            return query;
        },
        async rpc(name, params) { calls.push(['rpc', name, params]); return { data: rpcData, error }; },
    };
}

function product(group = 'drinks') {
    const unit = group === 'seeds' ? 'lạng' : group === 'tobacco' ? 'gói' : group === 'snacks' ? 'cái' : 'lon';
    const units = [{ id: 'base-id', key: 'base', name: unit, factor: '1', purchase_price: 4000, sale_price: '10000', can_purchase: true, can_sell: true }];
    if (!['other', 'spices'].includes(group)) units.push({ id: 'pack-id', key: 'pack', name: group === 'seeds' ? 'kg' : group === 'tobacco' ? 'cây' : 'thùng', factor: group === 'seeds' ? '10' : '24', purchase_price: '100000', sale_price: 150000, can_purchase: true, can_sell: true });
    if (group === 'snacks') units.push({ id: 'bag-id', key: 'bag', name: 'bịch', factor: '4', purchase_price: '20000', sale_price: null, can_purchase: true, can_sell: false });
    return { id: productId, store_id: storeId, name: 'Hàng mẫu', category: 'Hàng', product_group: group, base_unit: unit, stock_base: '48', low_stock_threshold: '5', is_active: true, version: '1', units };
}

test('configuration permits only public keys and safe API origins', () => {
    assert.equal(readSupabaseConfig(env).url, env.VITE_SUPABASE_URL);
    assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: jwt('anon') }).key, jwt('anon'));
    for (const key of ['sb_secret_private', jwt('service_role'), 'PASTE_LOCAL_PUBLISHABLE_KEY_HERE', 'sb_publishable_']) {
        assert.throws(() => readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: key }));
    }
    for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com?key=x', 'https://example.com/rest/v1']) {
        assert.throws(() => readSupabaseConfig({ ...env, VITE_SUPABASE_URL: url }));
    }
    assert.throws(() => readSupabaseConfig({}), /Thiếu/);
});

test('importing the foundation without Vite env does not initialize Supabase', () => {
    assert.equal(getSupabaseConfigurationStatus().configured, false);
    assert.doesNotThrow(() => createAuthService(() => { throw new Error('Must remain lazy'); }));
    assert.doesNotThrow(() => createSupabaseShopRepository({ storeId }));
});

test('signup keeps passwords intact and handles email confirmation without a session', async () => {
    let payload;
    const auth = createAuthService(() => ({ auth: { signUp: async input => { payload = input; return { data: { user: { id: userId }, session: null }, error: null }; } } }));
    const result = await auth.signUp({ email: ' Shop@Example.com ', password: ' a password ', name: ' BIN ' });
    assert.equal(payload.email, 'shop@example.com');
    assert.equal(payload.password, ' a password ');
    assert.deepEqual(payload.options.data, { name: 'BIN' });
    assert.equal(result.requiresEmailConfirmation, true);
    assert.equal(result.session, null);
});

test('signin, getSession, verified user, refresh and local logout use SDK lifecycle', async () => {
    const session = { user: { id: userId }, access_token: 'test-only' };
    let signOutOptions;
    const api = {
        signInWithPassword: async input => ({ data: { session, input }, error: null }),
        getSession: async () => ({ data: { session }, error: null }),
        getUser: async () => ({ data: { user: session.user }, error: null }),
        refreshSession: async () => ({ data: { session }, error: null }),
        signOut: async options => { signOutOptions = options; return { error: null }; },
    };
    const auth = createAuthService(() => ({ auth: api }));
    assert.equal((await auth.signIn({ email: 'SHOP@example.com', password: 'pw' })).input.email, 'shop@example.com');
    assert.equal(await auth.getSession(), session);
    assert.equal((await auth.getUser()).id, userId);
    assert.equal(await auth.refreshSession(), session);
    await auth.signOut();
    assert.deepEqual(signOutOptions, { scope: 'local' });
});

test('auth subscription supports cleanup and does not return callback promises to SDK', () => {
    let listener, unsubscribed = false, event;
    const auth = createAuthService(() => ({ auth: {
        onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    } }));
    const stop = auth.onAuthStateChange(value => { event = value; return Promise.resolve(); });
    assert.equal(listener('SIGNED_OUT', null), undefined);
    assert.equal(event, 'SIGNED_OUT');
    stop();
    assert.equal(unsubscribed, true);
});

test('password recovery uses Supabase Auth and never stores reset tokens in application tables', async () => {
    const calls = [];
    const auth = createAuthService(() => ({ auth: {
        resetPasswordForEmail: async (email, options) => { calls.push(['reset', email, options]); return { data: {}, error: null }; },
        updateUser: async payload => { calls.push(['update', payload]); return { data: {}, error: null }; },
    } }));
    await auth.requestPasswordReset(' Shop@Example.com ', 'http://localhost:5173/reset-password');
    await auth.updatePassword('shop1234');
    assert.deepEqual(calls, [
        ['reset', 'shop@example.com', { redirectTo: 'http://localhost:5173/reset-password' }],
        ['update', { password: 'shop1234' }],
    ]);
    await assert.rejects(auth.updatePassword('abcdefgh'), /chữ và số/);
});

test('missing auth session returns null, network/auth errors propagate unchanged', async () => {
    const failure = { code: 'network_error', message: 'Unavailable' };
    const missing = createAuthService(() => ({ auth: { getUser: async () => ({ data: {}, error: { name: 'AuthSessionMissingError' } }) } }));
    assert.equal(await missing.getUser(), null);
    const broken = createAuthService(() => ({ auth: { getUser: async () => ({ data: {}, error: failure }) } }));
    await assert.rejects(broken.getUser(), error => error === failure);
});

test('store context filters membership by authenticated user and does not select another store silently', async () => {
    const row = { store_id: storeId, user_id: userId, role: 'owner', stores: { id: storeId, name: 'BIN', business_type: 'grocery', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND' } };
    const client = fakeClient({ rows: [row] });
    const stores = createStoreService(() => client);
    const context = await stores.loadContext();
    assert.equal(context.store.id, storeId);
    assert.equal(context.store.timezone, 'Asia/Ho_Chi_Minh');
    assert.equal(context.store.businessType, 'grocery');
    assert.ok(client.calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === userId));
    assert.equal((await stores.loadContext(productId)).store, null);
    assert.equal((await stores.getStore(storeId)).role, 'owner');
    assert.equal((await stores.listMembers(storeId))[0].userId, userId);
});

test('missing store, multiple stores and signed-out state are explicit', async () => {
    const empty = createStoreService(() => fakeClient());
    assert.equal((await empty.loadContext()).needsStoreCreation, true);
    await assert.rejects(empty.getStore(storeId), /không tồn tại/);
    const multiple = createStoreService(() => fakeClient({ rows: [{ stores: { id: storeId } }, { stores: { id: productId } }] }));
    assert.equal((await multiple.loadContext()).needsStoreSelection, true);
    const signedOut = createStoreService(() => fakeClient({ user: null }));
    await assert.rejects(signedOut.listStores(), /đăng nhập/);
});

test('createStore only calls atomic create_store RPC and returns committed ID', async () => {
    const client = fakeClient({ rpcData: storeId });
    const stores = createStoreService(() => client);
    assert.equal(await stores.createStore(' BIN '), storeId);
    assert.deepEqual(client.calls, [['rpc', 'create_store', { p_name: 'BIN', p_business_type: 'grocery' }]]);
    await stores.createStore('Fruit BIN', 'fruit_shop');
    assert.deepEqual(client.calls[1], ['rpc', 'create_store', { p_name: 'Fruit BIN', p_business_type: 'fruit_shop' }]);
    await assert.rejects(stores.createStore('Wrong', 'staff'), /loại cửa hàng/);
});

test('all six pricing groups and legacy products map into the current UI shape', () => {
    for (const group of ['snacks', 'drinks', 'beer', 'spices', 'seeds', 'tobacco', 'other']) {
        const row = product(group);
        const mapped = mapProduct(row);
        assert.equal(mapped.stock, 48);
        assert.equal(mapped.price, 10000);
        assert.equal(mapped.unit, row.base_unit);
        assert.equal(mapped.pricing?.group, group === 'other' ? undefined : group);
        assert.deepEqual(mapped.units.map(mapUnitToDatabase), row.units.map(({ id: _id, ...unit }) => ({ ...unit, factor: Number(unit.factor), purchase_price: unit.purchase_price == null ? null : Number(unit.purchase_price), sale_price: unit.sale_price == null ? null : Number(unit.sale_price) })));
    }
    assert.equal(mapProduct(product('snacks')).pricing.bagsPerPack, 6);
    assert.equal(mapProduct(product('seeds')).pricing.unitsPerPack, 10);
});

test('inactive catalog drafts can be read before pack sizes and prices are known', () => {
    const row = { ...product('drinks'), is_active: false, stock_base: '0', units: [{ id: 'base-id', key: 'base', name: 'lon', factor: '1', purchase_price: null, sale_price: '0', can_purchase: false, can_sell: true }] };
    const mapped = mapProduct(row);
    assert.equal(mapped.price, 0);
    assert.equal(mapped.stock, 0);
    assert.equal(mapped.isActive, false);
    assert.equal(mapped.draftGroup, 'drinks');
    assert.equal(mapped.pricing, undefined);
});

test('fruit catalog maps gram stock and the kg price without inventing a gram sale price', () => {
    const row = { ...product('other'), product_group: 'fruit', base_unit: 'gram', stock_base: '15500', units: [
        { id: 'gram-id', key: 'base', name: 'gram', factor: '1', purchase_price: null, sale_price: null, can_purchase: false, can_sell: false },
        { id: 'kg-id', key: 'kg', name: 'kg', factor: '1000', purchase_price: '100000', sale_price: '180000', can_purchase: true, can_sell: true },
    ] };
    const mapped = mapProduct(row);
    assert.equal(mapped.stock, 15500);
    assert.equal(mapped.price, 180000);
    assert.deepEqual(mapped.pricing, { group: 'fruit', packUnit: 'kg', unitsPerPack: 1000, purchasePackPrice: 100000 });
    assert.equal(mapped.units[0].salePrice, null);
});

test('fruit sale mapper accepts exact three-decimal weight but never client totals', () => {
    const result = mapSaleCommand(storeId, { requestId, items: [{ productId, unitKey: 'kg', quantity: 1.35, total: 1, unitPrice: 1 }] });
    assert.deepEqual(result.p_items, [{ product_id: productId, unit_key: 'kg', quantity: 1.35 }]);
    for (const quantity of [0, -1, 1.2345, Number.NaN, Infinity]) {
        assert.throws(() => mapSaleCommand(storeId, { requestId, items: [{ productId, unitKey: 'kg', quantity }] }), /Số lượng/);
    }
});

test('product command preserves grocery conversions and fruit gram stock without editing inventory on update', () => {
    const drink = { name: 'Coca', category: 'Nước', unit: 'lon', price: 10000, stock: 24, isActive: true,
        pricing: { group: 'drinks', packUnit: 'thùng', unitsPerPack: 24, purchasePackPrice: 180000, retailPackPrice: 220000 } };
    const created = mapProductCommand(storeId, drink);
    assert.equal(created.p_opening_stock, 24);
    assert.deepEqual(created.p_units.map(unit => [unit.key, unit.factor, unit.sale_price]),
        [['base', 1, 10000], ['pack', 24, 220000]]);
    assert.equal(created.p_units[1].purchase_price, 180000);
    const edited = mapProductCommand(storeId, { ...drink, stock: 999 }, productId);
    assert.equal(edited.p_opening_stock, 0);
    assert.equal(edited.p_product_id, productId);
    const fruit = { name: 'Táo', category: 'Trái cây', unit: 'gram', price: 180000, stock: 15500,
        pricing: { group: 'fruit', packUnit: 'kg', unitsPerPack: 1000, purchasePackPrice: 100000 } };
    const mapped = mapProductCommand(storeId, fruit);
    assert.deepEqual(mapped.p_units.map(unit => [unit.key, unit.factor, unit.can_sell]),
        [['base', 1, false], ['kg', 1000, true]]);
    assert.equal(mapped.p_opening_stock, 15500);
});

test('cloud catalog and count commands use authorized RPCs, never direct stock writes', async () => {
    const client = fakeClient({ rpcData: productId });
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => client });
    await repo.commands.saveProduct({ name: 'Gia vị', category: 'Gia vị', unit: 'chai', price: 20000,
        stock: 0, pricing: { group: 'spices', packUnit: 'chai', unitsPerPack: 1, purchasePrice: 15000 } });
    await repo.commands.saveCustomer({ name: ' Lan ', phone: ' 0901 ', note: '' });
    await repo.commands.countStock({ requestId, items: [{ productId, actualBase: 96, expectedVersion: 1, reason: 'Sai kiểm kê' }] });
    await repo.commands.valueOpeningStock({ requestId, productId, unitKey: 'base', costPerUnit: 12000 });
    assert.deepEqual(client.calls.map(call => call[1]), ['save_product', 'save_customer', 'record_inventory_count_reviewed', 'value_opening_stock']);
    assert.equal(client.calls[1][2].p_name, 'Lan');
    assert.deepEqual(client.calls[2][2].p_items, [{ product_id: productId, actual_base: 96, reason: 'Sai kiểm kê', expected_version: 1 }]);
    assert.equal(client.calls[3][2].p_cost_per_unit, 12000);
    assert.ok(client.calls.every(call => call[0] === 'rpc'));
});

test('categories and suppliers are store-scoped, with writes only through owner RPCs', async () => {
    const client = fakeClient({ rows: [], rpcData: productId });
    const categories = createCategoryService(() => client);
    const suppliers = createSupplierService(() => client);
    await categories.list(storeId);
    await categories.save(storeId, ' Táo ');
    await suppliers.list(storeId);
    await suppliers.save(storeId, { name: ' Vườn BIN ', phone: '0123' });
    assert.ok(client.calls.some(call => call[0] === 'eq' && call[1] === 'store_id' && call[2] === storeId));
    assert.ok(client.calls.some(call => call[0] === 'rpc' && call[1] === 'save_category' && call[2].p_name === 'Táo'));
    assert.ok(client.calls.some(call => call[0] === 'rpc' && call[1] === 'save_supplier' && call[2].p_name === 'Vườn BIN'));
    assert.equal(client.calls.some(call => ['insert', 'update', 'delete'].includes(call[0])), false);
});

test('stock adjustment sends an idempotent server command in base units', async () => {
    const client = fakeClient({ rpcData: { movement_id: productId, balance_after: 14300 } });
    const inventory = createInventoryService(() => client);
    await inventory.adjustStock(storeId, { requestId, productId, quantityBase: -1200, reason: 'spoiled' });
    assert.deepEqual(client.calls[0], ['rpc', 'adjust_stock', { p_store_id: storeId, p_product_id: productId, p_quantity_base: -1200, p_reason: 'spoiled', p_request_id: requestId, p_note: null }]);
    assert.throws(() => inventory.adjustStock(storeId, { requestId, productId, quantityBase: -1.2, reason: 'spoiled' }), /Số lượng/);
});

test('supplier-linked receipt calls the five-argument RPC without client totals', async () => {
    const client = fakeClient({ rpcData: { receipt_id: requestId } });
    const inventory = createInventoryService(() => client);
    await inventory.receiveStock(storeId, { requestId, supplierId: customerId, items: [{ productId, unitKey: 'kg', quantity: 1.25, unitCost: 100000 }], totalCost: 1 });
    assert.deepEqual(client.calls[0], ['rpc', 'receive_stock', {
        p_store_id: storeId, p_request_id: requestId, p_items: [{ product_id: productId, unit_key: 'kg', quantity: 1.25, unit_cost: 100000 }],
        p_note: null, p_supplier_id: customerId,
    }]);
});

test('money and stock reject unsafe numbers instead of silently rounding bigint', () => {
    for (const value of ['9007199254740993', 9007199254740992, '', null, true, '12.5', -1]) assert.throws(() => toSafeInteger(value));
    assert.equal(toSafeInteger('9007199254740991'), Number.MAX_SAFE_INTEGER);
    assert.throws(() => mapProduct({ ...product(), stock_base: '9007199254740993' }));
    assert.throws(() => mapCustomer({ current_debt: '9007199254740993', open_invoice_count: 1 }));
});

test('repository scopes product queries, paginates and maps both read views', async () => {
    const client = fakeClient({ rows: [product()] });
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => client });
    const [item] = await repo.listProducts({ activeOnly: true, offset: 20, limit: 10 });
    assert.equal(item.stock, 48);
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'store_id', storeId])));
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['range', 20, 29])));
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['eq', 'is_active', true])));
    await repo.listProducts({ offset: 0, limit: 800 });
    assert.ok(client.calls.some(call => JSON.stringify(call) === JSON.stringify(['range', 0, 799])));
    assert.equal((await repo.getProduct(productId)).id, productId);
    await assert.rejects(repo.listProducts({ limit: 1000 }), /Phân trang/);
    const customers = fakeClient({ rows: [{ id: customerId, store_id: storeId, name: 'Khách', current_debt: '10000', open_invoice_count: '1', is_in_debt_book: true }] });
    const customerRepo = createSupabaseShopRepository({ storeId, clientProvider: () => customers });
    assert.equal((await customerRepo.listCustomers({ debtOnly: true }))[0].totalDebt, 10000);
    assert.ok(customers.calls.some(call => call[0] === 'from' && call[1] === 'customer_debt_summary'));
});

test('catalog import sends source rows to one atomic RPC without changing stock or balances', async () => {
    const client = fakeClient({ rpcData: { created: 1, quoted: 1, matched: 0, skipped_source: 0 } });
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => client });
    const record = { sourceId: 'G0001', name: 'Sting nho lon', category: 'Nước ngọt', draftGroup: 'drinks', unit: 'lon', salePrice: null,
        supplierQuote: { purchasePrice: 168000, originalPrice: '168', purchaseUnit: 'thùng', tiers: '50t 167', availability: 'Chưa xác nhận', reviewNote: '', originalLine: 'Sting nho lon 168' } };
    const result = await repo.commands.importCatalogDrafts(requestId, [record]);
    assert.equal(result.created, 1);
    assert.equal(client.calls.length, 1);
    const [, name, payload] = client.calls[0];
    assert.equal(name, 'import_catalog_drafts');
    assert.equal(payload.p_store_id, storeId);
    assert.equal(payload.p_request_id, requestId);
    assert.deepEqual(payload.p_rows[0], { source_id: 'G0001', name: 'Sting nho lon', category: 'Nước ngọt', product_group: 'drinks', base_unit: 'lon', sale_price: null,
        purchase_price: 168000, original_price: '168', purchase_unit: 'thùng', tiers: '50t 167', availability: 'Chưa xác nhận', review_note: '', original_line: 'Sting nho lon 168' });
    assert.equal('stock' in payload.p_rows[0], false);
    assert.equal('is_active' in payload.p_rows[0], false);
    await assert.rejects(repo.commands.importCatalogDrafts(undefined, [record]), /UUID/);
});

test('sale RPC strips client totals/prices and keeps request ID unchanged across retries', async () => {
    const client = fakeClient({ rpcData: { sale_id: productId, total_amount: 10000, duplicate: false } });
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => client });
    const command = { requestId, totalAmount: 1, stock: 999, items: [{ productId, unitKey: 'base', quantity: 1, price: 1 }] };
    const result = await repo.commands.createSale(command);
    await repo.commands.createSale(command);
    assert.equal(result.totalAmount, 10000);
    assert.deepEqual(client.calls[0], client.calls[1]);
    assert.deepEqual(client.calls[0][2], { p_store_id: storeId, p_request_id: requestId, p_items: [{ product_id: productId, unit_key: 'base', quantity: 1 }], p_payment_type: 'cash', p_customer_id: null });
    await assert.rejects(repo.commands.createSale({ ...command, requestId: undefined }), /UUID/);
    await assert.rejects(repo.commands.createSale({ ...command, paymentType: 'credit' }), /Khách mua chịu/);
    assert.equal(client.calls.length, 2);
});

test('receipts and debt payments only send intent through RPC; duplicate fields may be absent', async () => {
    const client = fakeClient({ rpcData: { receipt_id: productId, duplicate: true } });
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => client });
    const receipt = await repo.commands.receiveStock({ requestId, stock: 999, items: [{ productId, unitKey: 'pack', quantity: 0.1, unitCost: 100000 }] });
    assert.equal(receipt.duplicate, true);
    assert.equal('totalCost' in receipt, false);
    assert.deepEqual(client.calls[0][2].p_items, [{ product_id: productId, unit_key: 'pack', quantity: 0.1, unit_cost: 100000 }]);
    await repo.commands.recordDebtPayment({ requestId, customerId, amount: 10000, remainingDebt: 0 });
    assert.equal(client.calls[1][1], 'record_debt_payment');
    assert.equal(client.calls[1][2].p_amount, 10000);
    assert.equal('remainingDebt' in client.calls[1][2], false);
    await assert.rejects(repo.commands.recordDebtPayment({ customerId, amount: 10000 }), /UUID/);
});

test('cloud failures never fall back to demo or fabricate revenue', async () => {
    const failure = { code: '42501', message: 'Permission denied' };
    const repo = createSupabaseShopRepository({ storeId, clientProvider: () => fakeClient({ error: failure }) });
    await assert.rejects(repo.listProducts(), error => error.cause === failure && error.code === failure.code && error.applicationCode === 'FORBIDDEN');
    const report = createReportService(() => fakeClient({ error: failure }));
    await assert.rejects(report.getRevenue(storeId), error => error.cause === failure && error.code === failure.code && error.applicationCode === 'FORBIDDEN');
    await assert.rejects(createShopRepository(), /Chọn rõ/);
});

test('management report maps server totals and rejects malformed responses', async () => {
    const raw = {
        timezone: 'Asia/Ho_Chi_Minh', start_date: '2026-10-05', end_date: '2026-10-05',
        rows: [{ date: '2026-10-05', revenue: '30000', cash_collected: '10000', new_credit: '20000', repayments: '0', sales_count: '1', cogs: '22000', gross_profit: '8000', cost_data_complete: true }],
        totals: { revenue: '30000', cash_collected: '10000', new_credit: '20000', repayments: '0', sales_count: '1', outstanding_debt: '20000', cogs: '22000', gross_profit: '8000', gross_margin_percent: '26.67', cost_data_complete: true, unvalued_sale_events: '0', low_stock_count: '1', out_of_stock_count: '0', loss_value: null, loss_data_complete: false, unvalued_loss_movements: '1' },
        top_products_by_revenue: [{ product_id: productId, name: 'Nước ngọt', revenue: '30000', quantity_base: '2', base_unit: 'lon' }],
    };
    const client = fakeClient({ rpcData: raw });
    const report = createReportService(() => client);
    const result = await report.getRevenue(storeId, 1);
    assert.equal(result.totals.grossProfit, 8000);
    assert.equal(result.totals.grossMarginPercent, 26.67);
    assert.equal(result.totals.lossValue, null);
    assert.equal(result.rows[0].revenue, 30000);
    assert.equal(result.topProducts[0].id, productId);
    assert.deepEqual(client.calls[0], ['rpc', 'management_report', { p_store_id: storeId, p_days: 1 }]);
    await assert.rejects(report.getRevenue(storeId, 2), /1, 7, 30 hoặc 90/);
    await assert.rejects(createReportService(() => fakeClient({ rpcData: {} })).getRevenue(storeId), /chưa hợp lệ/);
});

test('demo repository works without Supabase env and never exposes mutable store references', async () => {
    const state = { products: [{ id: 'p1', name: 'A', stock: 5, isActive: true }, { id: 'p2', name: 'B', stock: 0, isActive: false }], customers: [{ id: 'c1', name: 'Khách', totalDebt: 10 }] };
    const repo = createDemoShopRepository(() => state);
    const [item] = await repo.listProducts({ activeOnly: true });
    item.stock = 0;
    assert.equal(state.products[0].stock, 5);
    assert.equal((await repo.listProducts()).length, 2);
    assert.equal(await repo.getProduct('unknown'), null);
    const chosen = await createShopRepository({ mode: 'demo', getDemoState: () => state });
    assert.equal(chosen.mode, 'demo');
    assert.equal((await chosen.listCustomers())[0].totalDebt, 10);
});
