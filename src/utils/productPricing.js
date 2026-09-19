export const PRODUCT_GROUPS = [
    { id: 'snacks', label: 'Bánh kẹo', description: 'Nhập thùng, nhập bịch, bán lẻ', icon: 'cookie' },
    { id: 'drinks', label: 'Nước', description: 'Bán nguyên thùng hoặc từng lon / chai', icon: 'bottle' },
    { id: 'beer', label: 'Bia', description: 'Nhập thùng, bán thùng hoặc lon', icon: 'beer' },
    { id: 'spices', label: 'Gia vị', description: 'Giá nhập và giá bán theo đơn vị', icon: 'spice' },
    { id: 'seeds', label: 'Hạt', description: 'Nhập theo kg, bán lẻ theo lạng', icon: 'seed' },
    { id: 'tobacco', label: 'Thuốc lá', description: 'Nhập cây, bán cây hoặc gói', icon: 'pack' },
];
export const BASIC_UNITS = ['cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên'];
export const groupLabel = id => PRODUCT_GROUPS.find(g => g.id === id)?.label || 'Hàng khác';
export function createPricingDraft(product, group = 'snacks') {
    const p = product?.pricing;
    return {
        group: p?.group || (product ? 'other' : group),
        retailUnit: product?.unit || (group === 'drinks' || group === 'beer' ? 'lon' : group === 'seeds' ? 'lạng' : group === 'tobacco' ? 'gói' : group === 'spices' ? 'chai' : 'bịch'),
        packSize: p?.unitsPerPack?.toString() || '',
        bagsPerPack: p?.bagsPerPack?.toString() || '',
        unitsPerBag: p?.unitsPerBag?.toString() || '',
        purchasePackPrice: p?.purchasePackPrice?.toString() ?? '',
        purchaseBagPrice: p?.purchaseBagPrice?.toString() ?? '',
        purchasePrice: p?.purchasePrice?.toString() ?? '',
        retailPackPrice: p?.retailPackPrice?.toString() ?? '',
        retailPrice: product?.price?.toString() ?? '',
    };
}
export function changePricingGroup(draft, group) {
    return { ...createPricingDraft(null, group), retailPrice: draft.retailPrice };
}
const money = (value, label) => {
    const n = Number(value);
    if (String(value).trim() === '' || !Number.isSafeInteger(n) || n < 0 || n > 999999999) throw new Error(`${label}: nhập số tiền từ 0 đến 999.999.999đ.`);
    return n;
};
const factor = (value, label) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > 100000) throw new Error(`${label}: nhập số nguyên từ 1 đến 100.000.`);
    return n;
};
export function buildPricing(draft) {
    const group = draft.group;
    const unit = group === 'seeds' ? 'lạng' : group === 'beer' ? 'lon' : group === 'tobacco' ? 'gói' : draft.retailUnit;
    if (!BASIC_UNITS.includes(unit)) throw new Error('Vui lòng chọn đơn vị bán lẻ.');
    if (group === 'drinks' && !['lon', 'chai'].includes(unit)) throw new Error('Nước cần chọn lon hoặc chai.');
    if (group === 'snacks' && !['bịch', 'gói', 'cái', 'viên'].includes(unit)) throw new Error('Chọn bịch, gói, cái hoặc viên cho bánh kẹo.');
    const price = money(draft.retailPrice, `Giá bán 1 ${unit}`);
    if (group === 'other') return { unit, price, pricing: undefined };
    if (!PRODUCT_GROUPS.some(g => g.id === group)) throw new Error('Nhóm hàng chưa hợp lệ.');
    const pricing = { group, packUnit: group === 'seeds' ? 'kg' : group === 'tobacco' ? 'cây' : group === 'spices' ? unit : 'thùng', unitsPerPack: 1 };
    if (group === 'spices') pricing.purchasePrice = money(draft.purchasePrice, 'Giá nhập');
    else {
        pricing.purchasePackPrice = money(draft.purchasePackPrice, `Giá nhập 1 ${pricing.packUnit}`);
        if (group === 'seeds') pricing.unitsPerPack = 10;
        else if (group === 'snacks') {
            pricing.bagsPerPack = factor(draft.bagsPerPack, 'Số bịch trong 1 thùng');
            pricing.unitsPerBag = unit === 'bịch' ? 1 : factor(draft.unitsPerBag, `Số ${unit} trong 1 bịch`);
            pricing.unitsPerPack = pricing.bagsPerPack * pricing.unitsPerBag;
            pricing.purchaseBagPrice = money(draft.purchaseBagPrice, 'Giá nhập 1 bịch');
        } else {
            pricing.unitsPerPack = factor(draft.packSize, `Số ${unit} trong 1 ${pricing.packUnit}`);
            pricing.retailPackPrice = money(draft.retailPackPrice, `Giá bán 1 ${pricing.packUnit}`);
        }
    }
    return { unit, price, pricing, category: groupLabel(group) };
}
export function validateProductPricing(product) {
    if (!product.pricing) return;
    const rebuilt = buildPricing(createPricingDraft(product));
    if (rebuilt.unit !== product.unit || rebuilt.pricing.unitsPerPack !== product.pricing.unitsPerPack) throw new Error('Quy đổi đơn vị chưa hợp lệ. Vui lòng kiểm tra lại.');
}
export function saleOptions(product) {
    const options = [{ key: 'base', unit: product.unit, factor: 1, price: product.price }];
    const p = product.pricing;
    if (p && ['drinks', 'beer', 'tobacco'].includes(p.group)) options.push({ key: 'pack', unit: p.packUnit, factor: p.unitsPerPack, price: p.retailPackPrice });
    return options;
}
export function purchaseOptions(product) {
    const p = product.pricing;
    if (!p) return [{ key: 'base', unit: product.unit, factor: 1, price: undefined }];
    if (p.group === 'spices') return [{ key: 'base', unit: product.unit, factor: 1, price: p.purchasePrice }];
    const options = [{ key: 'pack', unit: p.packUnit, factor: p.unitsPerPack, price: p.purchasePackPrice }];
    if (p.group === 'snacks') options.push({ key: 'bag', unit: 'bịch', factor: p.unitsPerBag, price: p.purchaseBagPrice });
    return options;
}
export function baseQuantity(quantity, conversion) {
    const n = Number(quantity) * conversion;
    const rounded = Math.round(n);
    if (!Number.isFinite(n) || Math.abs(n - rounded) > 0.000001 || rounded < 0 || !Number.isSafeInteger(rounded)) throw new Error('Số lượng nhập chưa khớp đơn vị bán lẻ. Với hạt, nhập theo bội số 0,1 kg.');
    return rounded;
}
export function stockDescription(product, stock = product.stock) {
    const p = product.pricing;
    if (!p || p.unitsPerPack <= 1) return `${stock} ${product.unit}`;
    if (p.group === 'seeds') return `${(stock / 10).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} kg (${stock} lạng)`;
    const packs = Math.floor(stock / p.unitsPerPack), rest = stock % p.unitsPerPack;
    return packs ? `${packs} ${p.packUnit}${rest ? ` + ${rest} ${product.unit}` : ''}` : `${stock} ${product.unit}`;
}
export function convertedExistingStock(old, next) {
    if (!old) return next.stock;
    if (old.unit === next.unit) return old.stock;
    if (!old.stock) return 0;
    if (!old.pricing && next.pricing) {
        if (old.unit === next.pricing.packUnit) return baseQuantity(old.stock, next.pricing.unitsPerPack);
        if (old.unit === 'bịch' && next.pricing.group === 'snacks') return baseQuantity(old.stock, next.pricing.unitsPerBag);
    }
    throw new Error(`Hàng đang tồn theo ${old.unit}. Hãy giữ đơn vị bán lẻ ${old.unit}, hoặc tạo mặt hàng riêng với đơn vị mới.`);
}
export const cartKey = (id, unitKey = 'base') => unitKey === 'base' ? id : `${id}::${unitKey}`;
export function cartLines(products, cart) {
    return Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([key, quantity]) => {
        const [productId, unitKey = 'base'] = key.split('::');
        const product = products.find(p => p.id === productId);
        const option = product && saleOptions(product).find(o => o.key === unitKey);
        return { key, product, option, quantity, baseQuantity: quantity * (option?.factor || 1), amount: quantity * (option?.price || 0), invalid: !product || !option };
    });
}
export function availableForOption(product, option, cart) {
    const used = saleOptions(product).filter(o => o.key !== option.key).reduce((sum, o) => sum + (cart[cartKey(product.id, o.key)] || 0) * o.factor, 0);
    return Math.max(0, Math.floor((product.stock - used) / option.factor));
}
