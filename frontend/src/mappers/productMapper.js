import { toSafeInteger, nullableMoney } from './numberMapper.js';
import { validateProductPricing } from '../utils/productPricing.js';
import { requireUuid, requiredText } from '../services/serviceUtils.js';

export function mapProduct(row) {
    const units = row.units.map(unit => ({
        id: unit.id, key: unit.key, name: unit.name,
        factor: toSafeInteger(unit.factor, 'Quy đổi', { min: 1 }),
        purchasePrice: nullableMoney(unit.purchase_price, 'Giá nhập'),
        salePrice: nullableMoney(unit.sale_price, 'Giá bán'),
        canPurchase: unit.can_purchase, canSell: unit.can_sell,
    }));
    const base = units.find(unit => unit.key === 'base');
    const pack = units.find(unit => unit.key === 'pack');
    const bag = units.find(unit => unit.key === 'bag');
    const weighedFruit = row.product_group === 'fruit' && row.base_unit === 'gram';
    const fruitSaleUnit = weighedFruit ? units.find(unit => unit.key === 'kg') ?? (pack?.name === 'kg' ? pack : null) : base;
    const seedRetail = units.find(unit => unit.key === 'lang');
    if (!base || base.factor !== 1) throw new Error('Mặt hàng thiếu đơn vị cơ sở hợp lệ.');
    const group = row.product_group;
    const draftIncomplete = !row.is_active && (
        (group === 'snacks' && (!pack || !bag))
        || (['drinks', 'beer', 'seeds', 'tobacco'].includes(group) && !pack)
        || (group === 'fruit' && !fruitSaleUnit)
        || (group === 'seeds' && row.base_unit === 'gram' && !seedRetail)
        || (group === 'spices' && base.purchasePrice === null)
    );
    let pricing;
    if (group !== 'other' && !draftIncomplete) {
        pricing = { group, packUnit: (group === 'fruit' ? fruitSaleUnit : pack)?.name ?? base.name, unitsPerPack: (group === 'fruit' ? fruitSaleUnit : pack)?.factor ?? 1 };
        if (group === 'spices') pricing.purchasePrice = base.purchasePrice;
        else if (group === 'fruit') {
            pricing.purchasePackPrice = fruitSaleUnit.purchasePrice;
            if (weighedFruit) {
                if (fruitSaleUnit.factor !== 1000) throw new Error('1 kg phải bằng 1000 gram.');
                if (fruitSaleUnit.key !== 'kg') pricing.primaryUnitKey = fruitSaleUnit.key;
                if (base.canSell) pricing.retailGramPrice = base.salePrice;
                if (seedRetail?.canSell) {
                    if (seedRetail.factor !== 100) throw new Error('1 lạng phải bằng 100 gram.');
                    pricing.retailLangPrice = seedRetail.salePrice;
                }
            }
            const fruitPack = units.find(unit => unit.key === 'fruit_pack') ?? (pack !== fruitSaleUnit ? pack : null);
            if (fruitPack) pricing.fruitPack = { unit: fruitPack.name, factor: fruitPack.factor,
                purchasePrice: fruitPack.purchasePrice, salePrice: fruitPack.salePrice,
                ...(!fruitPack.canPurchase ? { canPurchase: false } : {}), ...(!fruitPack.canSell ? { canSell: false } : {}),
                ...(fruitPack.key !== 'pack' ? { key: fruitPack.key } : {}) };
        }
        else {
            if (!pack) throw new Error('Mặt hàng thiếu đơn vị nhập kiện.');
            pricing.purchasePackPrice = pack.purchasePrice;
            if (group === 'seeds' && row.base_unit === 'gram') {
                if (!seedRetail || seedRetail.factor !== 100 || pack.factor !== 1000) throw new Error('Quy đổi kg/lạng/gram của hạt chưa khớp.');
                pricing.unitsPerRetail = seedRetail.factor;
                pricing.retailPackPrice = pack.salePrice;
            }
            if (group === 'snacks') {
                if (!bag || pack.factor % bag.factor !== 0) throw new Error('Quy đổi thùng/bịch chưa khớp.');
                pricing.unitsPerBag = bag.factor;
                pricing.bagsPerPack = pack.factor / bag.factor;
                pricing.purchaseBagPrice = bag.purchasePrice;
                if (pack.canSell) pricing.retailPackPrice = pack.salePrice;
                if (bag.canSell && row.base_unit !== 'bịch') pricing.retailBagPrice = bag.salePrice;
                if (base.canPurchase) pricing.purchaseRetailPrice = base.purchasePrice;
                const additional = units.filter(unit => !['base', 'bag', 'pack'].includes(unit.key));
                if (additional.length) pricing.additionalUnits = additional.map(unit => ({ key: unit.key, unit: unit.name,
                    factor: unit.factor, purchasePrice: unit.purchasePrice, salePrice: unit.salePrice,
                    canPurchase: unit.canPurchase, canSell: unit.canSell }));
            } else if (['drinks', 'beer', 'tobacco'].includes(group)) pricing.retailPackPrice = pack.salePrice;
        }
    }
    return {
        id: row.id, storeId: row.store_id, name: row.name, category: row.category, categoryId: row.category_id ?? null,
        unit: row.base_unit, price: group === 'fruit' ? fruitSaleUnit?.salePrice ?? null
            : group === 'seeds' && row.base_unit === 'gram' ? seedRetail?.salePrice ?? null : base.salePrice, stock: toSafeInteger(row.stock_base, 'Tồn kho'),
        isActive: row.is_active, pricing, draftGroup: draftIncomplete ? group : undefined, units,
        lowStockThreshold: toSafeInteger(row.low_stock_threshold, 'Ngưỡng tồn kho'),
        version: toSafeInteger(row.version, 'Phiên bản', { min: 1 }),
        createdAt: row.created_at, updatedAt: row.updated_at,
    };
}

/** Unit payload only. Stock changes never belong in a product edit payload. */
export function mapUnitToDatabase(unit) {
    return {
        key: unit.key, name: unit.name,
        factor: toSafeInteger(unit.factor, 'Quy đổi', { min: 1 }),
        purchase_price: nullableMoney(unit.purchasePrice, 'Giá nhập'),
        sale_price: nullableMoney(unit.salePrice, 'Giá bán'),
        can_purchase: unit.canPurchase, can_sell: unit.canSell,
    };
}

/** Map the existing form model to save_product; stock is only sent on creation. */
export function mapProductCommand(storeId, product, productId = null) {
    requireUuid(storeId, 'Cửa hàng');
    if (productId !== null) requireUuid(productId, 'Mặt hàng');
    if (!product || typeof product !== 'object') throw new Error('Mặt hàng chưa hợp lệ.');
    validateProductPricing(product);
    const name = requiredText(product.name, 'Tên hàng');
    const category = requiredText(product.category || 'Hàng khác', 'Loại hàng');
    if (name.length > 120 || category.length > 80) throw new Error('Tên hàng hoặc loại hàng quá dài.');
    const group = product.pricing?.group || 'other';
    const gramSeeds = group === 'seeds' && product.unit === 'gram';
    const weighedFruit = group === 'fruit' && product.unit === 'gram';
    const basePrice = toSafeInteger(product.price, 'Giá bán');
    const base = {
        key: 'base', name: product.unit, factor: 1,
        purchasePrice: group === 'snacks' ? product.pricing.purchaseRetailPrice ?? null : group === 'fruit' && !weighedFruit ? product.pricing.purchasePackPrice : group === 'spices' ? product.pricing.purchasePrice
            : group === 'other' ? product.units?.find(unit => unit.key === 'base')?.purchasePrice ?? null : null,
        salePrice: weighedFruit ? product.pricing.retailGramPrice ?? null : gramSeeds ? null : basePrice,
        canPurchase: group === 'snacks' && product.pricing.purchaseRetailPrice != null || group === 'fruit' && !weighedFruit || group === 'spices' || group === 'other',
        canSell: weighedFruit ? product.pricing.retailGramPrice != null : !gramSeeds,
    };
    const units = [base];
    if (group === 'fruit') {
        if (weighedFruit) {
            units.push({ key: product.pricing.primaryUnitKey || 'kg', name: 'kg', factor: 1000,
                purchasePrice: product.pricing.purchasePackPrice, salePrice: basePrice, canPurchase: true, canSell: true });
            if (product.pricing.retailLangPrice != null) units.push({ key: 'lang', name: 'lạng', factor: 100,
                purchasePrice: null, salePrice: product.pricing.retailLangPrice, canPurchase: false, canSell: true });
        }
        if (product.pricing.fruitPack) units.push({ key: product.pricing.fruitPack.key || 'pack', name: product.pricing.fruitPack.unit, factor: product.pricing.fruitPack.factor,
            purchasePrice: product.pricing.fruitPack.purchasePrice, salePrice: product.pricing.fruitPack.salePrice,
            canPurchase: product.pricing.fruitPack.canPurchase !== false, canSell: product.pricing.fruitPack.canSell !== false });
    }
    else if (group !== 'other' && group !== 'spices') {
        if (gramSeeds) units.push({ key: 'lang', name: 'lạng', factor: 100, purchasePrice: null,
            salePrice: basePrice, canPurchase: false, canSell: true });
        if (group === 'snacks') units.push({
            key: 'bag', name: 'bịch', factor: product.pricing.unitsPerBag,
            purchasePrice: product.pricing.purchaseBagPrice, salePrice: product.pricing.retailBagPrice ?? null,
            canPurchase: true, canSell: product.pricing.retailBagPrice != null && product.unit !== 'bịch',
        });
        units.push({
            key: 'pack', name: product.pricing.packUnit, factor: product.pricing.unitsPerPack,
            purchasePrice: product.pricing.purchasePackPrice,
            salePrice: ['drinks', 'beer', 'tobacco', 'snacks'].includes(group) || gramSeeds ? product.pricing.retailPackPrice ?? null : null,
            canPurchase: true, canSell: ['drinks', 'beer', 'tobacco'].includes(group) || gramSeeds || group === 'snacks' && product.pricing.retailPackPrice != null,
        });
        if (group === 'snacks') for (const unit of product.pricing.additionalUnits || []) units.push({ ...unit, name: unit.unit });
    }
    return {
        p_store_id: storeId, p_product_id: productId,
        p_name: name, p_category: category, p_product_group: group,
        p_base_unit: product.unit, p_units: units.map(mapUnitToDatabase),
        p_opening_stock: productId ? 0 : toSafeInteger(product.stock ?? 0, 'Tồn đầu kỳ'),
        p_low_stock_threshold: toSafeInteger(product.lowStockThreshold ?? (weighedFruit ? 5000 : gramSeeds ? 500 : 5), 'Ngưỡng tồn kho'),
        p_is_active: product.isActive !== false,
    };
}
