import { getSupabaseClient } from '../lib/supabase.js';
import { pageRange, requireUuid, unwrap } from './serviceUtils.js';
import { mapProductCommand } from '../mappers/productMapper.js';

const fields = 'id,store_id,name,category,category_id,product_group,base_unit,stock_base,low_stock_threshold,is_active,version,created_at,updated_at,units';

export function createProductService(clientProvider = getSupabaseClient) {
    return Object.freeze({
        async list(storeId, options = {}) {
            requireUuid(storeId, 'Cửa hàng');
            const { offset, end } = pageRange(options);
            let query = clientProvider().from('product_catalog').select(fields).eq('store_id', storeId);
            if (options.activeOnly) query = query.eq('is_active', true);
            return unwrap(query.order('name').order('id').range(offset, end));
        },
        async get(storeId, productId) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(productId, 'Mặt hàng');
            return unwrap(clientProvider().from('product_catalog').select(fields)
                .eq('store_id', storeId).eq('id', productId).maybeSingle());
        },
        save(storeId, product, productId = null, requestId = null) {
            const mapped = mapProductCommand(storeId, product, productId);
            if (!requestId) return unwrap(clientProvider().rpc('save_product', mapped));
            return unwrap(clientProvider().rpc('save_product_idempotent', {
                p_store_id: storeId, p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
                p_product: { ...mapped, expected_version: productId ? product.version : null },
            }));
        },
        async importCatalogDrafts(storeId, requestId, records) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(requestId, 'Lần nhập');
            if (!Array.isArray(records) || records.length < 1 || records.length > 2000) throw new Error('Danh mục cần từ 1 đến 2.000 dòng.');
            const rows = records.map(row => ({
                source_id: row.sourceId, name: row.name, category: row.category,
                product_group: row.draftGroup, base_unit: row.unit, sale_price: row.salePrice,
                purchase_price: row.supplierQuote.purchasePrice,
                original_price: row.supplierQuote.originalPrice,
                purchase_unit: row.supplierQuote.purchaseUnit, tiers: row.supplierQuote.tiers,
                availability: row.supplierQuote.availability, review_note: row.supplierQuote.reviewNote,
                original_line: row.supplierQuote.originalLine,
            }));
            return unwrap(clientProvider().rpc('import_catalog_drafts', {
                p_store_id: storeId, p_request_id: requestId, p_rows: rows,
            }));
        },
        async listSourceQuotes(storeId, { offset = 0, limit = 30 } = {}) {
            requireUuid(storeId, 'Cửa hàng');
            const range = pageRange({ offset, limit });
            return unwrap(clientProvider().from('product_source_quotes')
                .select('source_id,product_id,source_name,reference_cost,purchase_unit,review_note,availability')
                .eq('store_id', storeId).order('source_id').range(range.offset, range.end));
        },
    });
}

export const productService = createProductService();
