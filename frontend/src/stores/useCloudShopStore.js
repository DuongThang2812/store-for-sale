import { create } from 'zustand';
import { createSupabaseShopRepository } from '../repositories/supabaseShopRepository.js';
import { activityService } from '../services/activityService.js';
import { cartLines, cartKey, availableForOption, gramsFromKg, baseQuantity, isWeightedProduct, isWeightUnit, saleOptions } from '../utils/productPricing.js';
import { findProduct } from '../utils/productLookup.js';
import { useAccountStore } from './useAccountStore.js';
import { createCloudCommandRunner } from '../services/cloudCommandRunner.js';
import { PRODUCT_PAGE_SIZE } from '../services/productService.js';

const pageSize = 200;
let generation = 0;
let scopeVersion = 0;
const empty = () => ({ storeId: null, products: [], customers: [], entries: [], cart: {}, debtCarts: {},
    loading: false, error: '' });

async function listAll(read, limit = pageSize) {
    const rows = [];
    for (let offset = 0; offset < 10000; offset += limit) {
        const page = await read({ offset, limit });
        rows.push(...page);
        if (page.length < limit) return rows;
    }
    throw new Error('Có quá nhiều dữ liệu để tải toàn bộ. Vui lòng liên hệ quản trị viên.');
}

const commandWithRetry = createCloudCommandRunner({ context: () => ({
    scope: scopeVersion, actorId: useAccountStore.getState().user?.id,
    storeId: useCloudShopStore.getState().storeId,
}) });

export const useCloudShopStore = create((set, get) => ({
    ...empty(),
    // Retain uncertain request IDs across session refresh; each key includes actor + shop.
    reset() { generation += 1; scopeVersion += 1; set(empty()); },
    async load(storeId) {
        const current = ++generation;
        const first = get().storeId !== storeId;
        if (first) scopeVersion += 1;
        set({ ...(first ? empty() : {}), storeId, loading: first || !!get().error, error: '' });
        try {
            const repo = createSupabaseShopRepository({ storeId });
            const [products, allCustomers, entries] = await Promise.all([
                listAll(options => repo.listProducts(options), PRODUCT_PAGE_SIZE),
                listAll(options => repo.listCustomers(options)),
                activityService.list(storeId),
            ]);
            const customers = allCustomers.filter(row => row.isInDebtBook);
            if (current !== generation || get().storeId !== storeId) return;
            set({ products, customers, entries, loading: false, error: '' });
        } catch (error) {
            if (current !== generation || get().storeId !== storeId) return;
            set({ loading: false, error: error.message || 'Chưa tải được dữ liệu cửa hàng.' });
            throw error;
        }
    },
    setQuantity(lineKey, quantity, customerId) {
        const state = get();
        if (customerId && !state.customers.some(row => row.id === customerId)) return;
        const [productId, unitKey = 'base'] = lineKey.split('::');
        const product = findProduct(state.products, productId);
        const option = product && saleOptions(product).find(row => row.key === unitKey);
        if (!product?.isActive || !option) return;
        let next = 0;
        if (quantity !== 0 && quantity !== '') {
            if (isWeightedProduct(product)) {
            if (!isWeightUnit(option.unit) && !Number.isSafeInteger(Number(quantity))) return;
                const cart = customerId ? state.debtCarts[customerId] || {} : state.cart;
                const other = saleOptions(product).filter(row => row.key !== option.key)
                    .reduce((sum, row) => sum + (cart[cartKey(product.id, row.key)] || 0), 0);
                const remaining = Math.max(0, product.stock - other);
                try { next = Math.min(baseQuantity(quantity, option.factor), isWeightUnit(option.unit) ? remaining : Math.floor(remaining / option.factor) * option.factor); } catch { return; }
            } else {
                if (!Number.isFinite(quantity)) return;
                const cart = customerId ? state.debtCarts[customerId] || {} : state.cart;
                next = Math.max(0, Math.min(availableForOption(product, option, cart), Math.floor(quantity)));
            }
        }
        if (customerId) set(current => ({ debtCarts: { ...current.debtCarts,
            [customerId]: { ...current.debtCarts[customerId], [lineKey]: next } } }));
        else set(current => ({ cart: { ...current.cart, [lineKey]: next } }));
    },
    async checkout(customerId, cartOwnerId) {
        const state = get();
        if (cartOwnerId && cartOwnerId !== customerId) throw new Error('Vui lòng ghi nợ đúng khách đã chọn.');
        const cart = cartOwnerId ? state.debtCarts[cartOwnerId] || {} : state.cart;
        const lines = cartLines(state.products, cart);
        if (!lines.length || lines.some(line => line.invalid || !line.product.isActive || line.baseQuantity > line.product.stock)) {
            throw new Error('Giỏ hàng hoặc tồn kho chưa hợp lệ. Hãy kiểm tra lại.');
        }
        const items = lines.map(line => ({ productId: line.product.id,
            unitKey: line.option.key, quantity: line.quantity, expectedVersion: line.product.version }));
        const intent = { customerId: customerId || null,
            items: items.map(({ expectedVersion: _version, ...item }) => item) };
        const storeId = state.storeId;
        const repo = createSupabaseShopRepository({ storeId });
        const result = await commandWithRetry(storeId, 'sale', intent,
            requestId => repo.commands.createSale({ requestId, items,
                paymentType: customerId ? 'credit' : 'cash', customerId: customerId || null }),
            get().load);
        if (cartOwnerId) set(current => ({ debtCarts: { ...current.debtCarts, [cartOwnerId]: {} } }));
        else set({ cart: {} });
        return result;
    },
    async addCustomer(name, phone, note, carryCart = false) {
        const state = get();
        const repo = createSupabaseShopRepository({ storeId: state.storeId });
        const result = await commandWithRetry(state.storeId, 'customer_create',
            { name: name.trim(), phone: phone?.trim() || '', note: note?.trim() || '' },
            requestId => repo.commands.createCustomer({ requestId, name, phone, note }), get().load);
        const customerId = result.customer_id;
        set(current => ({ debtCarts: { ...current.debtCarts,
            [customerId]: carryCart ? current.cart : {} },
            ...(carryCart ? { cart: {} } : {}) }));
        return customerId;
    },
    async payDebt(customerId, amount) {
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        const result = await commandWithRetry(storeId, 'debt_payment', { customerId, amount },
            requestId => repo.commands.recordDebtPayment({ requestId, customerId, amount }), get().load);
        if (result.remainingDebt === 0) set(current => {
            const debtCarts = { ...current.debtCarts };
            delete debtCarts[customerId];
            return { debtCarts };
        });
        return result.remainingDebt;
    },
    async addStock(productId, quantity, unitKey = 'base', cost) {
        if (!Number.isSafeInteger(cost) || cost < 0) throw new Error('Vui lòng nhập giá nhập của lần này.');
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        const result = await commandWithRetry(storeId, 'stock_receipt', { productId, quantity, unitKey, cost },
            requestId => repo.commands.receiveStock({ requestId,
                items: [{ productId, quantity, unitKey, unitCost: cost }] }), get().load);
        return result.receiptId;
    },
    async saveProduct(product) {
        const storeId = get().storeId;
        const old = get().products.find(row => row.id === product.id);
        const repo = createSupabaseShopRepository({ storeId });
        return commandWithRetry(storeId, 'product_save', { product, productId: old?.id || null },
            requestId => repo.commands.saveProduct(product, old?.id || null, requestId), get().load);
    },
    async adjustFruitStock(productId, kilograms, reason, note = '') {
        const quantityBase = -gramsFromKg(kilograms);
        return get().adjustStock(productId, quantityBase, reason, note);
    },
    async adjustStock(productId, quantityBase, reason, note = '') {
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        return commandWithRetry(storeId, 'stock_adjustment', { productId, quantityBase, reason, note },
            requestId => repo.commands.adjustStock({ requestId, productId, quantityBase, reason, note }), get().load);
    },
    async cancelSale(saleId, reason, confirmed, previewToken) {
        if (!confirmed) throw new Error('Hãy xác nhận đã nhận lại hàng và hoàn tiền cần trả.');
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        return commandWithRetry(storeId, 'sale_cancel', { saleId, reason, previewToken },
            requestId => repo.commands.cancelSale({ saleId, reason, previewToken, requestId }), get().load);
    },
    async countStock(items, note = '') {
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        return commandWithRetry(storeId, 'inventory_count', { items, note },
            requestId => repo.commands.countStock({ requestId, items, note }), get().load);
    },
    async valueOpeningStock(productId, unitKey, costPerUnit) {
        const storeId = get().storeId;
        const repo = createSupabaseShopRepository({ storeId });
        return commandWithRetry(storeId, 'opening_cost', { productId, unitKey, costPerUnit },
            requestId => repo.commands.valueOpeningStock({ requestId, productId, unitKey, costPerUnit }), get().load);
    },
    async importProducts(rows) {
        const state = get();
        const repo = createSupabaseShopRepository({ storeId: state.storeId });
        const result = await commandWithRetry(state.storeId, 'stock_csv', rows,
            requestId => repo.commands.importStockCsv({ requestId, rows, products: state.products }),
            get().load);
        return result.row_count;
    },
    undoStock() { throw new Error('Lần nhập đã ghi DB. Hãy kiểm kê hoặc điều chỉnh với lý do thay vì hoàn tác im lặng.'); },
    importCatalogDrafts() { throw new Error('Hãy chọn Lưu vào Supabase DB trên trang nhập Excel.'); },
}));
