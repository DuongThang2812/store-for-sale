import { mapProductCommand } from './productMapper.js';
import { planStockImport, resolveStockCsvReceipt } from '../utils/stockCsv.js';

/** Preview is only UX; the PostgreSQL RPC validates units, money and stock. */
export function mapStockCsvRows(storeId, rows, products) {
    const plan = planStockImport(rows, products);
    return plan.map(row => {
        const existing = products.find(product => product.id === row.productId);
        const template = existing || row.productTemplate || {
            name: row.name, category: row.category || 'Hàng khác',
            unit: row.unit, price: row.price, stock: 0, isActive: true,
        };
        const { option, quantity, cost } = resolveStockCsvReceipt(row, template);
        const newProduct = existing ? null : mapProductCommand(storeId, {
            ...template, name: row.name, category: template.category || row.category || 'Hàng khác',
            stock: 0, isActive: true,
        });
        if (newProduct && !row.productTemplate && option.key === 'base') {
            newProduct.p_units[0].purchase_price = cost;
            newProduct.p_units[0].can_purchase = true;
        }
        return {
            existing_product_id: existing?.id ?? null,
            product: newProduct ? {
                name: newProduct.p_name, category: newProduct.p_category,
                product_group: newProduct.p_product_group, base_unit: newProduct.p_base_unit,
                units: newProduct.p_units,
                low_stock_threshold: newProduct.p_low_stock_threshold,
            } : null,
            unit_key: option.key, quantity, unit_cost: cost,
        };
    });
}
