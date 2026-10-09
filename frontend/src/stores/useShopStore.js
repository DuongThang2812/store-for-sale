import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createCachedStorage } from '../utils/cachedStorage.js';
import { findProduct } from '../utils/productLookup.js';
import { allocatePayment, applySaleCancellation } from '../utils/saleCancellation.js';
import { planStockImport, resolveStockCsvReceipt } from '../utils/stockCsv.js';
import { planCatalogDraftImport } from '../utils/catalogWorkbook.js';
import { cartLines, cartKey, availableForOption, snackConversionSignature, saleOptions, purchaseOptions, pricingWithPurchaseCost, baseQuantity, gramsFromKg, formatKgFromGrams, moneyForBaseQuantity, isWeightedProduct, isWeightUnit, retailUnitLabel, convertedExistingStock, validateProductPricing, stockDescription } from '../utils/productPricing.js';
const products = [
    { id: '1', name: 'Mì Hảo Hảo tôm chua cay', price: 4500, stock: 45, unit: 'gói', isActive: true, category: 'Đồ ăn' },
    { id: '2', name: 'Coca-Cola 330ml', price: 10000, stock: 5, unit: 'lon', isActive: true, category: 'Đồ uống' },
    { id: '3', name: 'Nước suối Aquafina 500ml', price: 5000, stock: 0, unit: 'chai', isActive: true, category: 'Đồ uống' },
    { id: '4', name: 'Sữa tươi Vinamilk', price: 8000, stock: 24, unit: 'hộp', isActive: true, category: 'Sữa & bánh' },
    { id: '5', name: 'Dầu ăn Tường An 1L', price: 48000, stock: 4, unit: 'chai', isActive: true, category: 'Gia vị' },
    { id: '6', name: 'Bánh Chocopie', price: 55000, stock: 12, unit: 'hộp', isActive: true, category: 'Sữa & bánh' },
    { id: '7', name: 'Nước mắm Nam Ngư', price: 35000, stock: 18, unit: 'chai', isActive: true, category: 'Gia vị' },
    { id: '8', name: 'Nước rửa chén Sunlight', price: 29000, stock: 15, unit: 'chai', isActive: true, category: 'Đồ gia dụng' },
];
const customers = [
    { id: 'c1', name: 'Anh Nam', phone: '0901 234 567', note: 'Nhà ở cuối hẻm', totalDebt: 120000 },
    { id: 'c2', name: 'Cô Lan', note: 'Cô Lan đầu hẻm', totalDebt: 75000 },
    { id: 'c3', name: 'Chị Hương', phone: '0912 345 678', totalDebt: 180000 },
    { id: 'c4', name: 'Chú Bình', note: 'Tiệm sửa xe', totalDebt: 275000 },
];
const stamp = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const initialEntries = [
    { id: 'e1', kind: 'sale', title: 'Bán hàng · Đã nhận tiền', detail: '3 món hàng', amount: 45000, date: stamp() },
    { id: 'e2', kind: 'debt', title: 'Anh Nam mua thiếu', detail: 'Số nợ ban đầu', amount: 120000, customerId: 'c1', date: stamp() },
    { id: 'e3', kind: 'stock', title: 'Nhập thêm Mì Hảo Hảo', detail: '20 gói đã được thêm vào kho', amount: 0, date: stamp() },
    { id: 'e4', kind: 'sale', title: 'Bán hàng · Đã nhận tiền', detail: '5 món hàng', amount: 85000, date: stamp() },
    ...customers.slice(1).map(c => ({ id: `opening-${c.id}`, kind: 'debt', title: `${c.name} mua thiếu`, detail: 'Số nợ ban đầu', amount: c.totalDebt, customerId: c.id, date: stamp() })),
];
export const useShopStore = create()(persist((set, get) => ({
    products, customers, entries: initialEntries, cart: {}, debtCarts: {},
    setQuantity: (lineKey, quantity, customerId) => {
        const state = get();
        if (customerId && !state.customers.some(c => c.id === customerId)) return;
        const updateCart = next => {
            const previous = customerId ? state.debtCarts[customerId] : state.cart;
            if ((previous?.[lineKey] || 0) === next) return;
            set(s => customerId
                ? { debtCarts: { ...s.debtCarts, [customerId]: { ...s.debtCarts[customerId], [lineKey]: next } } }
                : { cart: { ...s.cart, [lineKey]: next } });
        };
        if (quantity === 0 || quantity === '') { updateCart(0); return; }
        const [productId, unitKey = 'base'] = lineKey.split('::');
        const product = findProduct(state.products, productId);
        if (!product?.isActive) return;
        const option = saleOptions(product).find(o => o.key === unitKey);
        if (!option) return;
        if (isWeightedProduct(product)) {
            if (!isWeightUnit(option.unit) && !Number.isSafeInteger(Number(quantity))) return;
            let grams;
            try { grams = baseQuantity(quantity, option.factor); } catch { return; }
            const cart = customerId ? state.debtCarts[customerId] || {} : state.cart;
            const other = saleOptions(product).filter(row => row.key !== option.key)
                .reduce((sum, row) => sum + (cart[cartKey(product.id, row.key)] || 0), 0);
            const remaining = Math.max(0, product.stock - other);
            updateCart(Math.min(grams, isWeightUnit(option.unit) ? remaining : Math.floor(remaining / option.factor) * option.factor));
            return;
        }
        if (!Number.isFinite(quantity)) return;
        const cart = customerId ? state.debtCarts[customerId] || {} : state.cart;
        updateCart(Math.max(0, Math.min(availableForOption(product, option, cart), Math.floor(quantity))));
    },
    checkout: (customerId, cartOwnerId) => {
        const s = get();
        if (cartOwnerId && customerId !== cartOwnerId) throw new Error('Vui lòng ghi nợ đúng khách đã chọn.');
        const cart = cartOwnerId ? s.debtCarts[cartOwnerId] || {} : s.cart;
        const lines = cartLines(s.products, cart);
        if (!lines.length) throw new Error('Hãy chọn hàng trước khi thanh toán.');
        const sold = {};
        for (const line of lines) {
            const weighted = isWeightedProduct(line.product);
            if (line.invalid || !line.product.isActive || !Number.isSafeInteger(weighted ? line.baseQuantity : line.quantity) || line.baseQuantity < 1) throw new Error('Có mặt hàng không còn phù hợp. Vui lòng kiểm tra lại giỏ hàng.');
            sold[line.product.id] = (sold[line.product.id] || 0) + line.baseQuantity;
            if (sold[line.product.id] > line.product.stock) throw new Error('Tổng số hàng bán lẻ và nguyên kiện vượt tồn kho. Vui lòng giảm số lượng.');
        }
        const customer = s.customers.find(c => c.id === customerId);
        if (customerId && !customer) throw new Error('Vui lòng chọn người mua thiếu.');
        const total = lines.reduce((n, l) => n + l.amount, 0);
        if (!Number.isSafeInteger(total) || (customer && !Number.isSafeInteger(customer.totalDebt + total))) throw new Error('Tổng tiền vượt giới hạn. Vui lòng chia đơn nhỏ hơn.');
        set({ products: s.products.map(p => sold[p.id] ? { ...p, stock: p.stock - sold[p.id] } : p),
            ...(cartOwnerId ? { debtCarts: { ...s.debtCarts, [cartOwnerId]: {} } } : { cart: {} }),
            customers: s.customers.map(c => c.id === customerId ? { ...c, totalDebt: c.totalDebt + total, lastTransactionAt: stamp() } : c),
            entries: [{ id: id(), kind: customer ? 'debt' : 'sale', title: customer ? customer.name + ' mua thiếu' : 'Bán hàng · Đã nhận tiền', detail: lines.length + ' dòng hàng', amount: total, date: stamp(), customerId, items: lines.map(l => ({ productId: l.product.id, name: l.product.name, quantity: l.quantity, unit: l.option.unit, price: l.option.price, lineAmount: l.amount, stockQuantity: l.baseQuantity, stockUnit: l.product.unit })) }, ...s.entries],
        });
    },
    addStock: (productId, quantity, unitKey = 'base', cost) => {
        const s = get();
        const p = s.products.find(p => p.id === productId);
        const option = p && purchaseOptions(p).find(o => o.key === unitKey);
        if (!p?.isActive || !option || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999) throw new Error('Vui lòng kiểm tra số lượng và đơn vị nhập.');
        const added = baseQuantity(quantity, option.factor);
        if (added <= 0 || !Number.isSafeInteger(p.stock + added)) throw new Error('Số lượng nhập chưa hợp lệ.');
        if (cost !== undefined && (!Number.isSafeInteger(cost) || cost < 0 || cost > 999999999)) throw new Error('Giá nhập chưa hợp lệ.');
        if (p.pricing && cost === undefined) throw new Error('Vui lòng nhập giá nhập hàng.');
        const entryId = id();
        const pricing = pricingWithPurchaseCost(p, unitKey, cost);
        set({ products: s.products.map(item => item.id === productId ? { ...item, pricing, stock: item.stock + added } : item), entries: [{ id: entryId, kind: 'stock', title: 'Nhập thêm ' + p.name, detail: quantity + ' ' + option.unit + ' = ' + added + ' ' + p.unit + ' · Sau khi nhập: ' + stockDescription(p, p.stock + added), amount: 0, date: stamp(), productId, quantity: added, importQuantity: quantity, importUnit: option.unit, purchasePrice: cost, purchaseTotal: cost === undefined ? undefined : moneyForBaseQuantity(cost, added, option.factor), previousPricing: p.pricing }, ...s.entries] });
        return entryId;
    },
    undoStock: (entryId) => {
        const s = get();
        const e = s.entries.find(e => e.id === entryId);
        const p = s.products.find(p => p.id === e?.productId);
        if (!e || e.undone || !p || !e.quantity || p.stock < e.quantity)
            throw new Error('Không thể hoàn tác vì hàng đã thay đổi.');
        if (s.entries.slice(0, s.entries.findIndex(x => x.id === entryId)).some(x => x.productId === p.id || x.kind === 'sale' || x.kind === 'debt'))
            throw new Error('Đã có thao tác mới. Vui lòng kiểm tra lại lịch sử kho.');
        set({ products: s.products.map(x => x.id === p.id ? { ...x, stock: x.stock - e.quantity, ...('previousPricing' in e ? { pricing: e.previousPricing } : {}) } : x), entries: [{ id: id(), kind: 'stock', title: `Hoàn tác nhập ${p.name}`, detail: `Đã trừ lại ${e.quantity} ${p.unit}`, amount: 0, date: stamp(), productId: p.id }, ...s.entries.map(x => x.id === entryId ? { ...x, undone: true } : x)] });
    },
    adjustFruitStock: (productId, kilograms, reason, note = '') => {
        const s = get();
        const product = s.products.find(item => item.id === productId);
        const labels = { spoiled: 'Hàng hư', damaged: 'Dập, hỏng', lost: 'Thất lạc', personal_use: 'Dùng riêng', other: 'Hao hụt khác' };
        if (product?.pricing?.group !== 'fruit' || !isWeightedProduct(product) || !labels[reason]) throw new Error('Mặt hàng hoặc lý do hao hụt chưa hợp lệ.');
        const grams = gramsFromKg(kilograms);
        if (grams < 1 || grams > product.stock) throw new Error('Trọng lượng hao hụt phải lớn hơn 0 và không vượt tồn kho.');
        if (typeof note !== 'string' || note.trim().length > 300) throw new Error('Ghi chú tối đa 300 ký tự.');
        const after = product.stock - grams;
        const entryId = id();
        set({
            products: s.products.map(item => item.id === productId ? { ...item, stock: after } : item),
            entries: [{ id: entryId, kind: 'adjustment', title: `${labels[reason]} · ${product.name}`, detail: `Giảm ${stockDescription(product, grams)} · Còn ${stockDescription(product, after)}${note.trim() ? ` · ${note.trim()}` : ''}`, amount: 0, date: stamp(), productId, quantity: grams, reason, note: note.trim(), stockAfter: after }, ...s.entries],
        });
        return entryId;
    },

    saveProduct: (product) => {
        if (!product.name.trim() || !Number.isSafeInteger(product.price) || product.price < 0 || !Number.isSafeInteger(product.stock) || product.stock < 0) throw new Error('Hãy kiểm tra tên, giá và số lượng hàng.');
        validateProductPricing(product);
        const s = get();
        const old = s.products.find(p => p.id === product.id);
        const conversionChanged = old && (old.unit !== product.unit || old.pricing?.unitsPerPack !== product.pricing?.unitsPerPack || old.pricing?.unitsPerBag !== product.pricing?.unitsPerBag || old.pricing?.packUnit !== product.pricing?.packUnit || old.pricing?.group !== product.pricing?.group || old.pricing?.fruitPack?.unit !== product.pricing?.fruitPack?.unit || old.pricing?.fruitPack?.factor !== product.pricing?.fruitPack?.factor || snackConversionSignature(old) !== snackConversionSignature(product));
        const inCart = old && [s.cart, ...Object.values(s.debtCarts)].some(cart => Object.entries(cart).some(([key, q]) => q > 0 && key.split('::')[0] === old.id));
        if (conversionChanged && inCart) throw new Error('Mặt hàng đang nằm trong giỏ. Hãy hoàn tất hoặc bỏ mặt hàng khỏi các giỏ trước khi đổi quy cách.');
        if (old?.pricing && conversionChanged && old.stock > 0) throw new Error('Mặt hàng còn tồn kho. Hãy giữ quy cách hiện tại; nếu đóng gói khác, tạo mặt hàng mới để tránh nhầm tồn.');
        const stock = convertedExistingStock(old, product);
        const firstPricedImport = !old && (isWeightedProduct(product) || product.pricing?.group === 'fruit') && stock > 0;
        const importOption = firstPricedImport ? purchaseOptions(product)[0] : null;
        set({ products: old ? s.products.map(p => p.id === product.id ? { ...product, stock } : p) : [...s.products, product], entries: [{ id: id(), kind: old ? 'edit' : 'stock', title: (old ? 'Cập nhật' : 'Thêm hàng mới') + ' · ' + product.name, detail: (old ? 'Giá bán: ' + product.price.toLocaleString('vi-VN') + 'đ/' + (retailUnitLabel(product)) + ' · ' : '') + 'Trong kho: ' + stockDescription(product, stock) + (!product.isActive ? ' · Ngừng bán' : ''), amount: 0, productId: product.id, date: stamp(), ...(firstPricedImport ? { quantity: stock, importQuantity: stock / importOption.factor, importUnit: importOption.unit, purchasePrice: importOption.price, purchaseTotal: moneyForBaseQuantity(importOption.price, stock, importOption.factor) } : {}) }, ...s.entries] });
    },
    addCustomer: (name, phone, note, carryCart = false) => {
        if (!name.trim())
            throw new Error('Vui lòng nhập tên khách.');
        const customerId = id();
        set(s => ({ customers: [...s.customers, { id: customerId, name: name.trim(), phone, note, totalDebt: 0 }],
            debtCarts: { ...s.debtCarts, [customerId]: carryCart ? s.cart : {} },
            ...(carryCart ? { cart: {} } : {}),
        }));
        return customerId;
    },
    payDebt: (customerId, amount) => {
        const s = get();
        const c = s.customers.find(c => c.id === customerId);
        if (!c || !Number.isSafeInteger(amount) || amount <= 0 || amount > c.totalDebt)
            throw new Error('Số tiền phải lớn hơn 0 và không vượt quá số nợ.');
        const allocations = allocatePayment(s.entries, customerId, amount);
        const remaining = c.totalDebt - amount;
        const debtCarts = { ...s.debtCarts };
        if (remaining === 0) delete debtCarts[customerId];
        set({ customers: remaining === 0 ? s.customers.filter(c => c.id !== customerId) : s.customers.map(c => c.id === customerId ? { ...c, totalDebt: remaining, lastTransactionAt: stamp() } : c), debtCarts,
            entries: [{ id: id(), kind: 'payment', title: `${c.name} trả nợ`, detail: remaining === 0 ? 'Đã trả hết · Đã xóa khách khỏi sổ nợ' : `Còn nợ: ${remaining.toLocaleString('vi-VN')}đ`, amount, allocations, date: stamp(), customerId }, ...s.entries] });
        return remaining;
    },
    cancelSale: (saleId, reason, confirmed) => {
        const patch = applySaleCancellation(get(), saleId, reason, confirmed);
        set(patch);
    },
    importProducts: rows => {
        const s = get();
        const plan = planStockImport(rows, s.products);
        const products = [...s.products];
        const date = stamp();
        const entries = plan.map(row => {
            const productId = row.productId || id();
            const template = products.find(product => product.id === productId) || row.productTemplate;
            const receipt = isWeightedProduct(template) || template?.pricing?.group === 'fruit'
                || template?.pricing?.group === 'snacks' && (row.purchaseCost != null || row.productTemplate)
                ? resolveStockCsvReceipt(row, template) : null;
            if (row.productId) {
                const index = products.findIndex(p => p.id === productId);
                products[index] = { ...products[index], stock: row.after, ...(receipt ? { pricing: pricingWithPurchaseCost(products[index], receipt.option.key, receipt.cost) } : {}) };
            } else {
                products.push({ ...row.productTemplate, ...(receipt ? { pricing: pricingWithPurchaseCost(row.productTemplate, receipt.option.key, receipt.cost) } : {}), id: productId, name: row.name, price: row.price, stock: row.baseAdded, unit: row.stockUnit, category: row.productTemplate?.category || row.category || 'Hàng khác', isActive: true });
            }
            return { id: id(), kind: 'stock', title: `${row.productId ? 'Nhập thêm' : 'Thêm hàng mới'} · ${row.name}`, detail: `Nhập từ CSV: ${row.quantity} ${row.unit} · Trong kho: ${row.stockUnit === 'gram' ? formatKgFromGrams(row.after) : `${row.after} ${row.stockUnit}`}`, amount: 0, date, productId, quantity: row.baseAdded, importQuantity: receipt?.quantity ?? row.quantity, importUnit: receipt?.option.unit ?? row.unit, ...(receipt ? { purchasePrice: receipt.cost, purchaseTotal: moneyForBaseQuantity(receipt.cost, row.baseAdded, receipt.option.factor) } : {}) };
        });
        set({ products, entries: [...entries, ...s.entries] });
        return plan.length;
    },
    importCatalogDrafts: records => {
        const s = get();
        const plan = planCatalogDraftImport(records, s.products);
        if (!plan.create.length) return { created: 0, skipped: plan.skipped };
        set({ products: [...s.products, ...plan.create.map(product => ({ ...product, id: id() }))], entries: [{ id: id(), kind: 'edit', title: 'Nhập danh mục hàng nháp', detail: `${plan.create.length} mặt hàng mới · ${plan.skipped} tên trùng bỏ qua · Tồn kho 0`, amount: 0, date: stamp() }, ...s.entries] });
        return { created: plan.create.length, skipped: plan.skipped };
    },
}), { name: 'little-store-signed-out', storage: createCachedStorage(), partialize: s => ({ products: s.products, customers: s.customers, entries: s.entries, cart: s.cart, debtCarts: s.debtCarts }) }));

