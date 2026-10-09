// Integration against the running local stack, using real Auth/PostgREST and
// the same services/repository as React. Only this run's fixtures are removed.
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthService } from '../src/services/authService.js';
import { createStoreService } from '../src/services/storeService.js';
import { createReportService } from '../src/services/reportService.js';
import { createShopSettingsService } from '../src/services/shopSettingsService.js';
import { createSupabaseShopRepository } from '../src/repositories/supabaseShopRepository.js';
import { readSupabaseConfig } from '../src/lib/supabaseConfig.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const raw = execSync('npm exec -- supabase status -o env', {
    cwd: resolve(root, '../backend'), encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
});
const env = Object.fromEntries(raw.split(/\r?\n/).map(line => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean).map(([, key, value]) => [key, value.replace(/^"|"$/g, '')]));
assert.match(env.API_URL, /^http:\/\/127\.0\.0\.1:54321\/?$/, 'Local Supabase only');
assert.ok(env.SERVICE_ROLE_KEY && env.ANON_KEY, 'Local keys unavailable');
const publicConfig = process.env.VITE_SUPABASE_URL ? readSupabaseConfig(process.env) : { url: env.API_URL, key: env.ANON_KEY };
assert.equal(new URL(publicConfig.url).origin, new URL(env.API_URL).origin, 'Frontend must target this local stack');
const client = key => createClient(env.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, options = {}) => fetch(url, { ...options,
        signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) }) } });
const service = client(env.SERVICE_ROLE_KEY);
const marker = `bin-http-${randomUUID()}`;
const users = [];
const sql = statement => execFileSync('docker', ['exec', '-i', 'supabase_db_little_store_fe',
    'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: statement, encoding: 'utf8', windowsHide: true, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
});
const totals = () => JSON.parse(sql(`select jsonb_build_object(
    'shops',(select count(*) from public.stores),'products',(select count(*) from public.products),
    'sales',(select count(*) from public.sales),'customers',(select count(*) from public.customers),
    'auth_users',(select count(*) from auth.users));`));
const before = totals();
let checks = 0;
let stage = 'Auth';
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const denied = async (operation, label) => { await assert.rejects(operation, undefined, label); checks++; };

async function account(role) {
    const email = `${marker}-${role}@example.invalid`;
    const password = `Smoke-${randomUUID()}-9`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    users.push({ id: created.data.user.id, email });
    const sessionClient = client(publicConfig.key);
    const auth = createAuthService(() => sessionClient);
    await auth.signIn({ email, password });
    equal((await auth.getUser()).id, created.data.user.id, 'Auth verifies the signed-in user');
    await auth.refreshSession();
    equal((await auth.getUser()).id, created.data.user.id, 'Auth refresh keeps verified identity');
    return { id: created.data.user.id, email, client: sessionClient, auth };
}

function cleanupFixtures() {
    if (!users.length) return;
    for (const user of users) {
        assert.match(user.id, /^[0-9a-f-]{36}$/);
        assert.equal(user.email.startsWith(marker + '-'), true);
    }
    const ids = users.map(user => `'${user.id}'::uuid`).join(',');
    // Validate ownership before deletion; then order store tables by their
    // foreign-key dependencies. No TRUNCATE/CASCADE or store-wide wildcard.
    sql(`begin;
      create temporary table fixture_users(id uuid primary key) on commit drop;
      insert into fixture_users values ${users.map(user => `('${user.id}')`).join(',')};
      do $$ begin
        if exists(select 1 from auth.users u join fixture_users f on f.id=u.id
          where u.email not like '${marker}-%@example.invalid') then
          raise exception 'Fixture identity mismatch'; end if;
      end $$;
      create temporary table fixture_stores(id uuid primary key) on commit drop;
      insert into fixture_stores select id from public.stores
        where created_by in (${ids}) and name like '${marker}%';
      do $$ begin
        if exists(select 1 from public.store_members m join fixture_users u on u.id=m.user_id
          where not exists(select 1 from fixture_stores s where s.id=m.store_id)) then
          raise exception 'Fixture belongs to an unexpected shop'; end if;
      end $$;
      create temporary table fixture_tables(id oid primary key, name text) on commit drop;
      insert into fixture_tables select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and exists(select 1 from pg_attribute a
          where a.attrelid=c.oid and a.attname='store_id' and not a.attisdropped);
      do $$ declare t record; begin
        while exists(select 1 from fixture_tables) loop
          select f.* into t from fixture_tables f where not exists(
            select 1 from pg_constraint k join fixture_tables child on child.id=k.conrelid
            where k.contype='f' and k.confrelid=f.id and k.conrelid<>f.id) order by f.name limit 1;
          if not found then raise exception 'Fixture cleanup FK cycle'; end if;
          execute format('delete from public.%I where store_id in (select id from fixture_stores)',t.name);
          delete from fixture_tables where id=t.id;
        end loop;
      end $$;
      delete from public.stores where id in (select id from fixture_stores);
      delete from public.security_events where user_id in (${ids});
      commit;`);
}

try {
    const owner = await account('owner');
    const staff = await account('staff');
    const other = await account('other');
    const stores = createStoreService(() => owner.client);
    stage = 'Store context';
    const grocery = await stores.createStore(`${marker} grocery`, 'grocery');
    const fruit = await stores.createStore(`${marker} fruit`, 'fruit_shop');
    equal((await stores.loadContext(grocery)).store.role, 'owner', 'Owner context loads through PostgREST');
    equal((await stores.getStore(fruit)).businessType, 'fruit_shop', 'Fruit is its own business type');
    const repo = createSupabaseShopRepository({ storeId: grocery, clientProvider: () => owner.client });
    const reports = createReportService(() => owner.client);
    stage = 'Product and receipt';
    const productId = await repo.commands.saveProduct({ name: 'Coca HTTP', category: 'Nước', unit: 'chai', price: 10000,
        stock: 0, lowStockThreshold: 5, pricing: { group: 'drinks', packUnit: 'thùng', unitsPerPack: 24,
            purchasePackPrice: 180000, retailPackPrice: 225000 } }, null, randomUUID());
    const receipt = { requestId: randomUUID(), items: [{ productId, unitKey: 'pack', quantity: 2, unitCost: 180000 }] };
    equal((await repo.commands.receiveStock(receipt)).totalCost, 360000, 'Receipt uses server cost');
    equal((await repo.commands.receiveStock(receipt)).duplicate, true, 'Receipt retry is idempotent');
    let product = await repo.getProduct(productId);
    equal(product.stock, 48, 'Two cartons become 48 bottles');
    const customer = await repo.commands.createCustomer({ requestId: randomUUID(), name: 'Khách HTTP' });
    const customerId = customer.customer_id;
    stage = 'Reviewed credit checkout';
    const saleIntent = { requestId: randomUUID(), paymentType: 'credit', customerId,
        items: [{ productId, unitKey: 'pack', quantity: 1, expectedVersion: product.version },
            { productId, unitKey: 'base', quantity: 2, expectedVersion: product.version }] };
    const sale = await repo.commands.createSale(saleIntent);
    equal(sale.totalAmount, 245000, 'Independent carton/bottle prices come from PostgreSQL');
    equal((await repo.commands.createSale(saleIntent)).duplicate, true, 'Reviewed sale retry commits once');
    equal((await repo.getProduct(productId)).stock, 22, 'Mixed sale uses one base stock');
    equal((await repo.getCustomer(customerId)).totalDebt, 245000, 'Credit debt comes from DB');
    let dashboard = await reports.getDashboard(grocery);
    equal(dashboard.report.totals.cogs, 195000, 'Dashboard maps COGS snapshot');
    equal(dashboard.report.totals.received, 0, 'Credit does not fabricate cash');
    stage = 'Debt payment and cancellation';
    const payment = { requestId: randomUUID(), customerId, amount: 45000 };
    await repo.commands.recordDebtPayment(payment);
    equal((await repo.commands.recordDebtPayment(payment)).duplicate, true, 'Payment retry commits once');
    equal((await repo.getCustomer(customerId)).totalDebt, 200000, 'Partial payment preserves remaining debt');
    dashboard = await reports.getDashboard(grocery);
    equal(dashboard.report.totals.received, 45000, 'Collection increases cash');
    equal(dashboard.report.totals.revenue, 245000, 'Collection never increases revenue');
    const preview = await repo.previewCancellation(sale.saleId);
    equal(preview.refund_amount, 45000, 'Preview refunds paid part');
    const cancellation = { saleId: sale.saleId, reason: 'HTTP fixture', requestId: randomUUID(), previewToken: preview.preview_token };
    await repo.commands.cancelSale(cancellation);
    equal((await repo.commands.cancelSale(cancellation)).duplicate, true, 'Cancellation retry commits once');
    equal((await repo.getProduct(productId)).stock, 48, 'Cancellation restores exact stock');
    equal((await repo.getCustomer(customerId)).isInDebtBook, false, 'Settled customer leaves debt book without deleting history');
    dashboard = await reports.getDashboard(grocery);
    equal([dashboard.report.totals.revenue, dashboard.report.totals.received, dashboard.report.totals.cogs], [0, 0, 0], 'Cancellation reverses money and cost exactly');
    stage = 'Inventory count';
    product = await repo.getProduct(productId);
    await repo.commands.countStock({ requestId: randomUUID(), items: [{ productId, actualBase: 47, expectedVersion: product.version, reason: 'HTTP physical count' }] });
    equal((await repo.getProduct(productId)).stock, 47, 'Reviewed count adjusts server stock');
    await denied(repo.commands.countStock({ requestId: randomUUID(), items: [{ productId, actualBase: 99, expectedVersion: product.version, reason: 'Stale count' }] }), 'Stale count cannot overwrite newer stock');
    stage = 'Staff and tenant isolation';
    await createShopSettingsService(() => owner.client).saveStaff(grocery, { requestId: randomUUID(), email: staff.email });
    const staffRepo = createSupabaseShopRepository({ storeId: grocery, clientProvider: () => staff.client });
    const outsiderRepo = createSupabaseShopRepository({ storeId: grocery, clientProvider: () => other.client });
    const staffProduct = await staffRepo.getProduct(productId);
    equal(staffProduct.pricing.purchasePackPrice, null, 'Staff cannot read purchase cost');
    equal(!!(await staff.client.from('product_units').select('purchase_price').eq('product_id', productId)).error, true, 'Raw unit SELECT cannot bypass purchase masking');
    equal((await staff.client.from('stock_receipt_items').select('unit_cost').eq('store_id', grocery)).data, [], 'Receipt history is owner-only');
    await denied(createReportService(() => staff.client).getDashboard(grocery), 'Staff cannot read owner financial dashboard');
    await denied(staffRepo.commands.receiveStock({ ...receipt, requestId: randomUUID() }), 'Staff import permission is enforced');
    await denied(staffRepo.commands.createSale({ ...saleIntent, requestId: randomUUID() }), 'Staff cannot create credit without debt permission');
    equal(await outsiderRepo.listProducts(), [], 'Other tenant cannot read products');
    await denied(outsiderRepo.commands.receiveStock({ ...receipt, requestId: randomUUID() }), 'Other tenant cannot write stock');
    const directWrite = await owner.client.from('products').update({ stock_base: 999 }).eq('id', productId);
    equal(!!directWrite.error, true, 'Owner direct stock PATCH is blocked');
    const staffSale = await staffRepo.commands.createSale({ requestId: randomUUID(), items: [{ productId, unitKey: 'base', quantity: 1, expectedVersion: staffProduct.version }] });
    equal(staffSale.totalAmount, 10000, 'Default staff permission allows cash sale');
    stage = 'Fruit decimal and spoilage';
    const fruitRepo = createSupabaseShopRepository({ storeId: fruit, clientProvider: () => owner.client });
    const fruitId = await fruitRepo.commands.saveProduct({ name: 'Táo HTTP', category: 'Táo', unit: 'gram', price: 180000,
        stock: 0, pricing: { group: 'fruit', packUnit: 'kg', unitsPerPack: 1000, purchasePackPrice: 100000 } }, null, randomUUID());
    await fruitRepo.commands.receiveStock({ requestId: randomUUID(), items: [{ productId: fruitId, unitKey: 'kg', quantity: 15.5, unitCost: 100000 }] });
    const fruitProduct = await fruitRepo.getProduct(fruitId);
    equal((await fruitRepo.commands.createSale({ requestId: randomUUID(), items: [{ productId: fruitId, unitKey: 'kg', quantity: 1.35, expectedVersion: fruitProduct.version }] })).totalAmount, 243000, 'Fruit decimal checkout is exact');
    equal((await reports.getDashboard(fruit)).report.totals.grossProfit, 108000, 'Fruit COGS/profit maps from PostgreSQL');
    await fruitRepo.commands.adjustStock({ requestId: randomUUID(), productId: fruitId, quantityBase: -1200, reason: 'spoiled' });
    const fruitDashboard = await reports.getDashboard(fruit);
    equal(fruitDashboard.spoilage.quantityByUnit, [{ baseUnit: 'gram', quantityBase: 1200 }], 'Spoilage uses integer grams');
    equal(fruitDashboard.spoilage.value, 120000, 'Spoilage keeps historical cost');
    await owner.auth.signOut();
    equal(await owner.auth.getSession(), null, 'Logout clears the test session');
    console.log(`Shop HTTP integration: ${checks} checks passed using real Auth/PostgREST and frontend services.`);
} catch (error) {
    console.error(`Shop HTTP failed at ${stage}: ${error.applicationCode || error.code || error.name}.`);
    // Only custom assertion text is public; never print sessions/keys/SDK bodies.
    if (error.code === 'ERR_ASSERTION') console.error(error.message);
    process.exitCode = 1;
} finally {
    try {
        cleanupFixtures();
        for (const user of users) {
            const removed = await service.auth.admin.deleteUser(user.id);
            assert.ifError(removed.error);
        }
        assert.deepEqual(totals(), before, 'Existing shop/product/sale/customer/user counts must remain unchanged');
        console.log('Owned HTTP fixtures removed; existing database counts preserved.');
    } catch {
        console.error('HTTP fixture cleanup did not finish. Existing data was not reset; investigate test fixtures.');
        process.exitCode = 1;
    }
}
