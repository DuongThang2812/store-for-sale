import { findProduct } from './productLookup.js';

export const PRODUCT_GROUPS = [
    { id: 'snacks', label: 'Bánh kẹo', description: 'Nhập thùng, nhập bịch, bán lẻ', icon: 'cookie' },
    { id: 'drinks', label: 'Nước', description: 'Bán nguyên thùng hoặc từng lon / chai', icon: 'bottle' },
    { id: 'beer', label: 'Bia', description: 'Nhập thùng, bán thùng hoặc lon', icon: 'beer' },
    { id: 'spices', label: 'Gia vị', description: 'Giá nhập và giá bán theo đơn vị', icon: 'spice' },
    { id: 'seeds', label: 'Hạt', description: 'Nhập theo kg, bán theo kg hoặc lạng', icon: 'seed' },
    { id: 'tobacco', label: 'Thuốc lá', description: 'Nhập cây, bán cây hoặc gói', icon: 'pack' },
    { id: 'fruit', label: 'Trái cây', description: 'Bán theo cân, quả hoặc hộp; giá riêng từng đơn vị', icon: 'fruit' },
];
export const FRUIT_COUNT_UNITS = ['quả', 'trái', 'hộp', 'khay', 'túi', 'thùng'];
export const SNACK_UNITS = ['thùng', 'bịch', 'gói', 'cái', 'viên'];
export const BASIC_UNITS = ['cái', 'gói', 'chai', 'lon', 'hộp', 'bịch', 'thùng', 'kg', 'lạng', 'cây', 'viên', 'gram', 'quả', 'trái', 'khay', 'túi'];
export const isWeightUnit = unit => ['kg', 'lạng', 'gram'].includes(unit);
export const productGroupsForBusiness = businessType => businessType === 'fruit_shop'
    ? PRODUCT_GROUPS.filter(group => group.id === 'fruit')
    : PRODUCT_GROUPS.filter(group => group.id !== 'fruit');
export const groupLabel = id => PRODUCT_GROUPS.find(g => g.id === id)?.label || 'Hàng khác';
export const isWeightedProduct = product => product?.unit === 'gram'
    && ['fruit', 'seeds'].includes(product.pricing?.group);
export const retailUnitLabel = product => product.pricing?.group === 'fruit' && isWeightedProduct(product) ? 'kg'
    : product.pricing?.group === 'seeds' ? 'lạng' : product.unit;
export function createPricingDraft(product, group = 'snacks') {
    const p = product?.pricing;
    return {
        group: p?.group || product?.draftGroup || (product ? 'other' : group),
        baseUnit: product?.unit || (group === 'seeds' ? 'gram' : undefined),
        retailUnit: product?.unit || (group === 'fruit' ? 'gram' : group === 'drinks' || group === 'beer' ? 'lon' : group === 'seeds' ? 'lạng' : group === 'tobacco' ? 'gói' : group === 'spices' ? 'chai' : 'bịch'),
        packSize: p?.unitsPerPack?.toString() || '',
        bagsPerPack: p?.bagsPerPack?.toString() || '',
        unitsPerBag: p?.unitsPerBag?.toString() || '',
        purchasePackPrice: p?.purchasePackPrice?.toString() ?? '',
        purchaseBagPrice: p?.purchaseBagPrice?.toString() ?? '',
        purchasePrice: p?.purchasePrice?.toString() ?? '',
        retailPackPrice: p?.retailPackPrice?.toString() ?? '',
        retailBagPrice: p?.retailBagPrice?.toString() ?? '',
        purchaseRetailPrice: p?.purchaseRetailPrice?.toString() ?? '',
        additionalUnits: (p?.additionalUnits || []).map(unit => ({ ...unit, factor: String(unit.factor),
            purchasePrice: unit.purchasePrice == null ? '' : String(unit.purchasePrice),
            salePrice: unit.salePrice == null ? '' : String(unit.salePrice) })),
        retailPrice: product?.price?.toString() ?? '',
        retailLangPrice: p?.retailLangPrice?.toString() ?? '',
        retailGramPrice: p?.retailGramPrice?.toString() ?? '',
        fruitPackEnabled: !!p?.fruitPack,
        fruitPackUnit: p?.fruitPack?.unit ?? 'hộp',
        fruitPackFactor: p?.fruitPack?.factor?.toString() ?? '',
        fruitPackPurchasePrice: p?.fruitPack?.purchasePrice?.toString() ?? '',
        fruitPackSalePrice: p?.fruitPack?.salePrice?.toString() ?? '',
        fruitPackCanPurchase: p?.fruitPack?.canPurchase !== false,
        fruitPackCanSell: p?.fruitPack?.canSell !== false,
        primaryUnitKey: p?.primaryUnitKey,
        fruitPackKey: p?.fruitPack?.key,
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
const optionalMoney = (value, label) => value == null || value === '' ? null : money(value, label);

function buildSnackUnits(draft, baseUnit) {
    if (!Array.isArray(draft.additionalUnits || []) || (draft.additionalUnits || []).length > 5) throw new Error('Mặt hàng có tối đa 8 đơn vị.');
    const keys = new Set(['base', 'bag', 'pack']);
    const names = new Set([baseUnit, 'bịch', 'thùng']);
    return (draft.additionalUnits || []).map(unit => {
        if (!unit || typeof unit !== 'object' || Array.isArray(unit)
            || Object.keys(unit).some(key => !['key', 'unit', 'factor', 'purchasePrice', 'salePrice', 'canPurchase', 'canSell'].includes(key))
            || typeof unit.key !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(unit.key)
            || keys.has(unit.key) || !SNACK_UNITS.includes(unit.unit) || names.has(unit.unit)) throw new Error('Đơn vị bánh kẹo bị trùng hoặc chưa hợp lệ.');
        if (typeof unit.canPurchase !== 'boolean' || typeof unit.canSell !== 'boolean' || !unit.canPurchase && !unit.canSell) throw new Error('Đơn vị thêm cần dùng để nhập hoặc bán.');
        keys.add(unit.key); names.add(unit.unit);
        return { key: unit.key, unit: unit.unit, factor: factor(unit.factor, `Số ${baseUnit} trong 1 ${unit.unit}`),
            canPurchase: unit.canPurchase, canSell: unit.canSell,
            purchasePrice: unit.canPurchase ? money(unit.purchasePrice, `Giá nhập 1 ${unit.unit}`) : null,
            salePrice: unit.canSell ? money(unit.salePrice, `Giá bán 1 ${unit.unit}`) : null };
    });
}

export function snackConversionSignature(product) {
    return JSON.stringify((product?.pricing?.additionalUnits || []).map(unit => [unit.key, unit.unit, unit.factor]).sort((a, b) => a[0].localeCompare(b[0])));
}
export function buildPricing(draft) {
    const group = draft.group;
    const unit = group === 'fruit' ? draft.retailUnit || 'gram' : group === 'seeds' ? draft.baseUnit === 'lạng' ? 'lạng' : 'gram' : group === 'beer' ? 'lon' : group === 'tobacco' ? 'gói' : draft.retailUnit;
    if (!BASIC_UNITS.includes(unit)) throw new Error('Vui lòng chọn đơn vị bán lẻ.');
    if (group === 'drinks' && !['lon', 'chai'].includes(unit)) throw new Error('Nước cần chọn lon hoặc chai.');
    if (group === 'snacks' && !['bịch', 'gói', 'cái', 'viên'].includes(unit)) throw new Error('Chọn bịch, gói, cái hoặc viên cho bánh kẹo.');
    const price = money(draft.retailPrice, `Giá bán 1 ${group === 'fruit' && unit === 'gram' ? 'kg' : group === 'seeds' ? 'lạng' : unit}`);
    if (group === 'fruit') {
        if (unit !== 'gram' && !FRUIT_COUNT_UNITS.includes(unit)) throw new Error('Chọn cân theo kg hoặc đơn vị quả, trái, hộp, khay, túi, thùng.');
        const weighted = unit === 'gram';
        const pricing = { group, packUnit: weighted ? 'kg' : unit, unitsPerPack: weighted ? 1000 : 1,
            purchasePackPrice: money(draft.purchasePackPrice, `Giá nhập 1 ${weighted ? 'kg' : unit}`) };
        if (weighted && draft.primaryUnitKey === 'pack') pricing.primaryUnitKey = 'pack';
        if (weighted) for (const key of ['retailLangPrice', 'retailGramPrice']) {
            if (draft[key] !== '' && draft[key] != null) pricing[key] = money(draft[key], key === 'retailLangPrice' ? 'Giá bán 1 lạng' : 'Giá bán 1 gram');
        }
        if (draft.fruitPackEnabled) {
            if (!FRUIT_COUNT_UNITS.includes(draft.fruitPackUnit) || draft.fruitPackUnit === unit) throw new Error('Đơn vị đóng gói phải khác đơn vị tồn kho.');
            if (draft.fruitPackCanPurchase === false && draft.fruitPackCanSell === false) throw new Error('Đơn vị đóng gói cần dùng để nhập hoặc bán.');
            pricing.fruitPack = { unit: draft.fruitPackUnit, factor: factor(draft.fruitPackFactor, `Số ${unit} trong 1 ${draft.fruitPackUnit}`),
                purchasePrice: draft.fruitPackCanPurchase === false ? null : money(draft.fruitPackPurchasePrice, `Giá nhập 1 ${draft.fruitPackUnit}`),
                salePrice: draft.fruitPackCanSell === false ? null : money(draft.fruitPackSalePrice, `Giá bán 1 ${draft.fruitPackUnit}`),
                ...(draft.fruitPackCanPurchase === false ? { canPurchase: false } : {}),
                ...(draft.fruitPackCanSell === false ? { canSell: false } : {}) };
            if (draft.fruitPackKey === 'fruit_pack' || pricing.primaryUnitKey === 'pack') pricing.fruitPack.key = 'fruit_pack';
        }
        return { unit, price, category: groupLabel(group), pricing };
    }
    if (group === 'other') return { unit, price, pricing: undefined };
    if (!PRODUCT_GROUPS.some(g => g.id === group)) throw new Error('Nhóm hàng chưa hợp lệ.');
    const pricing = { group, packUnit: group === 'seeds' ? 'kg' : group === 'tobacco' ? 'cây' : group === 'spices' ? unit : 'thùng', unitsPerPack: 1 };
    if (group === 'spices') pricing.purchasePrice = money(draft.purchasePrice, 'Giá nhập');
    else {
        pricing.purchasePackPrice = money(draft.purchasePackPrice, `Giá nhập 1 ${pricing.packUnit}`);
        if (group === 'seeds') {
            pricing.unitsPerPack = unit === 'gram' ? 1000 : 10;
            if (unit === 'gram') {
                pricing.unitsPerRetail = 100;
                pricing.retailPackPrice = money(draft.retailPackPrice === '' || draft.retailPackPrice == null
                    ? price * 10 : draft.retailPackPrice, 'Giá bán 1 kg');
            }
        }
        else if (group === 'snacks') {
            pricing.bagsPerPack = factor(draft.bagsPerPack, 'Số bịch trong 1 thùng');
            pricing.unitsPerBag = unit === 'bịch' ? 1 : factor(draft.unitsPerBag, `Số ${unit} trong 1 bịch`);
            pricing.unitsPerPack = pricing.bagsPerPack * pricing.unitsPerBag;
            pricing.purchaseBagPrice = money(draft.purchaseBagPrice, 'Giá nhập 1 bịch');
            for (const [key, label] of [['retailPackPrice', 'Giá bán 1 thùng'], ['retailBagPrice', 'Giá bán 1 bịch'], ['purchaseRetailPrice', `Giá nhập 1 ${unit}`]]) {
                const value = optionalMoney(draft[key], label);
                if (value !== null) pricing[key] = value;
            }
            if (unit === 'bịch' && pricing.retailBagPrice != null) throw new Error('Đã bán theo bịch; chỉ cần nhập một giá bán lẻ.');
            const additional = buildSnackUnits(draft, unit);
            if (additional.length) pricing.additionalUnits = additional;
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
    if (product.pricing.fruitPack) {
        const pack = product.pricing.fruitPack;
        if (['canPurchase', 'canSell'].some(key => pack[key] != null && typeof pack[key] !== 'boolean')
            || ['unit', 'factor', 'purchasePrice', 'salePrice'].some(key => rebuilt.pricing.fruitPack[key] !== pack[key])
            || (pack.key || 'pack') !== (rebuilt.pricing.fruitPack.key || 'pack')) throw new Error('Quy cách đóng gói trái cây chưa hợp lệ.');
    }
    if (product.pricing.group === 'snacks' && ((rebuilt.pricing.additionalUnits || []).some((unit, index) =>
        ['key', 'unit', 'factor', 'purchasePrice', 'salePrice', 'canPurchase', 'canSell'].some(key => unit[key] !== product.pricing.additionalUnits[index]?.[key]))
        || ['retailPackPrice', 'retailBagPrice', 'purchaseRetailPrice'].some(key => (rebuilt.pricing[key] ?? null) !== (product.pricing[key] ?? null)))) throw new Error('Giá hoặc đơn vị bánh kẹo chưa hợp lệ.');
    if (isWeightedProduct(product) && product.pricing.group === 'seeds'
        && product.pricing.unitsPerRetail !== 100) throw new Error('1 lạng phải bằng 100 gram.');
}
export function saleOptions(product) {
    if (product.pricing?.group === 'fruit') {
        const p = product.pricing;
        const options = isWeightedProduct(product) ? [{ key: p.primaryUnitKey || 'kg', unit: 'kg', factor: 1000, price: product.price }]
            : [{ key: 'base', unit: product.unit, factor: 1, price: product.price }];
        if (isWeightedProduct(product)) {
            if (p.retailLangPrice != null) options.push({ key: 'lang', unit: 'lạng', factor: 100, price: p.retailLangPrice });
            if (p.retailGramPrice != null) options.push({ key: 'base', unit: 'gram', factor: 1, price: p.retailGramPrice });
        }
        if (p.fruitPack && p.fruitPack.canSell !== false) options.push({ key: p.fruitPack.key || 'pack', unit: p.fruitPack.unit, factor: p.fruitPack.factor, price: p.fruitPack.salePrice });
        return options;
    }
    if (isWeightedProduct(product)) return [
        { key: 'lang', unit: 'lạng', factor: 100, price: product.price },
        { key: 'pack', unit: 'kg', factor: 1000, price: product.pricing.retailPackPrice },
    ];
    const options = [{ key: 'base', unit: product.unit, factor: 1, price: product.price }];
    const p = product.pricing;
    if (p && ['drinks', 'beer', 'tobacco'].includes(p.group)) options.push({ key: 'pack', unit: p.packUnit, factor: p.unitsPerPack, price: p.retailPackPrice });
    if (p?.group === 'snacks') {
        if (p.retailPackPrice != null) options.push({ key: 'pack', unit: 'thùng', factor: p.unitsPerPack, price: p.retailPackPrice });
        if (p.retailBagPrice != null && product.unit !== 'bịch') options.push({ key: 'bag', unit: 'bịch', factor: p.unitsPerBag, price: p.retailBagPrice });
        for (const unit of p.additionalUnits || []) if (unit.canSell) options.push({ key: unit.key, unit: unit.unit, factor: unit.factor, price: unit.salePrice });
    }
    return options;
}
export function purchaseOptions(product) {
    const p = product.pricing;
    if (!p) return [{ key: 'base', unit: product.unit, factor: 1, price: undefined }];
    if (p.group === 'fruit') {
        const options = isWeightedProduct(product) ? [{ key: p.primaryUnitKey || 'kg', unit: 'kg', factor: 1000, price: p.purchasePackPrice }]
            : [{ key: 'base', unit: product.unit, factor: 1, price: p.purchasePackPrice }];
        if (p.fruitPack && p.fruitPack.canPurchase !== false) options.push({ key: p.fruitPack.key || 'pack', unit: p.fruitPack.unit, factor: p.fruitPack.factor, price: p.fruitPack.purchasePrice });
        return options;
    }
    if (p.group === 'spices') return [{ key: 'base', unit: product.unit, factor: 1, price: p.purchasePrice }];
    const options = [{ key: 'pack', unit: p.packUnit, factor: p.unitsPerPack, price: p.purchasePackPrice }];
    if (p.group === 'snacks') options.push({ key: 'bag', unit: 'bịch', factor: p.unitsPerBag, price: p.purchaseBagPrice });
    if (p.group === 'snacks') {
        if (p.purchaseRetailPrice != null) options.push({ key: 'base', unit: product.unit, factor: 1, price: p.purchaseRetailPrice });
        for (const unit of p.additionalUnits || []) if (unit.canPurchase) options.push({ key: unit.key, unit: unit.unit, factor: unit.factor, price: unit.purchasePrice });
    }
    return options;
}
export function pricingWithPurchaseCost(product, unitKey, cost) {
    if (!product.pricing) return undefined;
    const p = product.pricing;
    if (p.group === 'snacks' && p.additionalUnits?.some(unit => unit.key === unitKey)) return { ...p,
        additionalUnits: p.additionalUnits.map(unit => unit.key === unitKey ? { ...unit, purchasePrice: cost } : unit) };
    if (p.group === 'fruit') return p.fruitPack && unitKey === (p.fruitPack.key || 'pack')
        ? { ...p, fruitPack: { ...p.fruitPack, purchasePrice: cost } } : { ...p, purchasePackPrice: cost };
    return { ...p, [unitKey === 'pack' ? 'purchasePackPrice' : unitKey === 'bag' ? 'purchaseBagPrice' : p.group === 'snacks' ? 'purchaseRetailPrice' : 'purchasePrice']: cost };
}
export function baseQuantity(quantity, conversion) {
    const raw = String(quantity).trim();
    if (!Number.isSafeInteger(conversion) || conversion < 1 || !/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Số lượng nhập chưa khớp đơn vị nhỏ nhất.');
    const [whole, decimals = ''] = raw.split('.');
    const scale = 10n ** BigInt(decimals.length);
    const result = (BigInt(whole) * scale + BigInt(decimals || '0')) * BigInt(conversion);
    if (result % scale !== 0n || result / scale > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Số lượng nhập chưa khớp đơn vị nhỏ nhất. Với hàng cân, kg tối đa 3 số lẻ và lạng tối đa 2 số lẻ.');
    return Number(result / scale);
}
export const gramsFromKg = kg => baseQuantity(kg, 1000);
export function kgFromGrams(grams) {
    if (!Number.isSafeInteger(grams) || grams < 0) throw new Error('Số gam chưa hợp lệ.');
    return grams / 1000;
}
export function formatKgFromGrams(grams) {
    if (!Number.isSafeInteger(grams) || grams < 0) throw new Error('Số gam chưa hợp lệ.');
    const decimal = String(grams % 1000).padStart(3, '0').replace(/0+$/, '');
    return `${Math.floor(grams / 1000).toLocaleString('vi-VN')}${decimal ? ',' + decimal : ''} kg`;
}
/** Price and stock are integers: round a unit-priced line to the nearest đồng, half up. */
export function moneyForBaseQuantity(pricePerUnit, quantityBase, factor) {
    if (!Number.isSafeInteger(pricePerUnit) || pricePerUnit < 0 || !Number.isSafeInteger(quantityBase) || quantityBase < 0
        || !Number.isSafeInteger(factor) || factor < 1) throw new Error('Giá hoặc trọng lượng chưa hợp lệ.');
    const amount = (2n * BigInt(pricePerUnit) * BigInt(quantityBase) + BigInt(factor)) / (2n * BigInt(factor));
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Thành tiền vượt giới hạn.');
    return Number(amount);
}
export const moneyForWeight = (pricePerKg, grams) => moneyForBaseQuantity(pricePerKg, grams, 1000);
export function stockDescription(product, stock = product.stock) {
    const p = product.pricing;
    if (isWeightedProduct(product)) return formatKgFromGrams(stock);
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
    return Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([key, storedQuantity]) => {
        const [productId, unitKey = 'base'] = key.split('::');
        const product = findProduct(products, productId);
        const option = product && saleOptions(product).find(o => o.key === unitKey);
        const weighted = isWeightedProduct(product);
        const quantity = weighted && option ? storedQuantity / option.factor : storedQuantity;
        const base = weighted ? storedQuantity : storedQuantity * (option?.factor || 1);
        const invalid = !product || !option || !Number.isSafeInteger(base) || base <= 0;
        return { key, product, option, quantity, baseQuantity: base,
            amount: invalid ? 0 : weighted ? moneyForBaseQuantity(option.price, storedQuantity, option.factor) : storedQuantity * option.price,
            invalid };
    });
}
export function availableForOption(product, option, cart) {
    const weighted = isWeightedProduct(product);
    const used = saleOptions(product).filter(o => o.key !== option.key).reduce((sum, o) => sum + (cart[cartKey(product.id, o.key)] || 0) * (weighted ? 1 : o.factor), 0);
    if (weighted) return Math.max(0, isWeightUnit(option.unit) ? (product.stock - used) / option.factor : Math.floor((product.stock - used) / option.factor));
    return Math.max(0, Math.floor((product.stock - used) / option.factor));
}
