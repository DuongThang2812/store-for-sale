import { getSupabaseClient } from '../lib/supabase.js';
import { mapProductCommand } from '../mappers/productMapper.js';
import { toSafeInteger } from '../mappers/numberMapper.js';
import { createSupabaseShopRepository } from '../repositories/supabaseShopRepository.js';
import { inspectLegacySnapshot } from './legacyMigration.js';
import { requireUuid, unwrap } from './serviceUtils.js';
import { validateSnapshot } from '../utils/backup.js';

const pageSize = 200;
const errorText = 'Đối chiếu dữ liệu DB chưa khớp bản trên máy. Dữ liệu máy vẫn được giữ nguyên.';

export function mapLegacySnapshot(storeId, state) {
    const snapshot = validateSnapshot(state);
    const report = inspectLegacySnapshot(snapshot);
    if (report.review.debtDiscrepancies.length || report.review.orphanOutstandingCustomerCount) {
        throw new Error('Sổ nợ cũ chưa khớp lịch sử. Cần đối chiếu từng khách trước khi chuyển dữ liệu.');
    }
    const products = snapshot.products.map(product => {
        const command = mapProductCommand(storeId, product);
        return {
            legacy_id: product.id,
            name: command.p_name, category: command.p_category,
            product_group: command.p_product_group, base_unit: command.p_base_unit,
            units: command.p_units, stock_base: command.p_opening_stock,
            low_stock_threshold: command.p_low_stock_threshold,
            is_active: command.p_is_active,
        };
    });
    const customers = snapshot.customers.map(customer => ({
        legacy_id: customer.id, name: customer.name.trim(),
        phone: customer.phone?.trim() || '', note: customer.note?.trim() || '',
        current_debt: customer.totalDebt,
    }));
    const entries = snapshot.entries.map(entry => ({
        legacy_id: entry.id, kind: entry.kind, date: entry.date,
        customer_legacy_id: entry.customerId || null,
        source_entry: entry,
    }));
    return { products, customers, entries, report };
}

async function allPages(read) {
    const result = [];
    for (let offset = 0; offset < 4000; offset += pageSize) {
        const page = await read({ offset, limit: pageSize });
        if (!Array.isArray(page)) throw new Error(errorText);
        result.push(...page);
        if (page.length < pageSize) return result;
    }
    throw new Error('Cửa hàng có quá nhiều dòng để đối chiếu tự động. Dữ liệu máy vẫn được giữ nguyên.');
}

async function countRows(client, table, storeId, batchId) {
    const request = client.from(table).select('*', { count: 'exact', head: true })
        .eq('store_id', storeId).eq('batch_id', batchId);
    return unwrap(Promise.resolve(request).then(result => ({ ...result, data: result.count })));
}

export function createLegacyImportService(clientProvider = getSupabaseClient) {
    const service = {
        async importSnapshot(storeId, { backup, persistVersion = 0, requestId }) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(requestId, 'Mã yêu cầu');
            if (backup?.format !== 'little-store-backup' || backup.version !== 1
                || !/^[0-9a-f]{64}$/.test(backup.checksum || '')) {
                throw new Error('Bản sao lưu chưa hợp lệ.');
            }
            const payload = mapLegacySnapshot(storeId, backup.state);
            const dbResult = await unwrap(clientProvider().rpc('import_legacy_snapshot', {
                p_store_id: storeId, p_request_id: requestId,
                p_snapshot_sha256: backup.checksum,
                p_persist_version: persistVersion,
                p_products: payload.products, p_customers: payload.customers,
                p_entries: payload.entries,
            }));
            try { await service.verify(storeId, { backup, batchId: dbResult.batch_id, payload }); }
            catch (cause) {
                const error = new Error('DB đã nhận bản chuyển nhưng chưa đối chiếu xong. Giữ file sao lưu và kiểm tra lại dữ liệu DB trước khi bán tiếp.');
                error.cause = cause;
                error.importCommitted = true;
                error.batchId = dbResult.batch_id;
                throw error;
            }
            return { ...dbResult, report: payload.report };
        },
        async verify(storeId, { backup, batchId, payload = mapLegacySnapshot(storeId, backup.state) }) {
            requireUuid(storeId, 'Cửa hàng');
            requireUuid(batchId, 'Lần chuyển dữ liệu');
            const client = clientProvider();
            const batch = await unwrap(client.from('legacy_import_batches')
                .select('id,store_id,snapshot_sha256,status,counts')
                .eq('store_id', storeId).eq('id', batchId).maybeSingle());
            if (!batch || batch.status !== 'completed' || batch.snapshot_sha256 !== backup.checksum) {
                throw new Error(errorText);
            }
            const repository = createSupabaseShopRepository({ storeId, clientProvider });
            const [productLinks, customerLinks, products, customers, historyCount] = await Promise.all([
                allPages(({ offset, limit }) => unwrap(client.from('legacy_product_links')
                    .select('product_id').eq('store_id', storeId).eq('batch_id', batchId)
                    .order('legacy_id').range(offset, offset + limit - 1))),
                allPages(({ offset, limit }) => unwrap(client.from('legacy_customer_links')
                    .select('customer_id').eq('store_id', storeId).eq('batch_id', batchId)
                    .order('legacy_id').range(offset, offset + limit - 1))),
                allPages(options => repository.listProducts(options)),
                allPages(options => repository.listCustomers(options)),
                countRows(client, 'legacy_history_entries', storeId, batchId),
            ]);
            const productMap = new Map(products.map(row => [row.id, row]));
            const customerMap = new Map(customers.map(row => [row.id, row]));
            const stock = productLinks.reduce((sum, row) => sum + (productMap.get(row.product_id)?.stock ?? NaN), 0);
            const debt = customerLinks.reduce((sum, row) => sum + (customerMap.get(row.customer_id)?.totalDebt ?? NaN), 0);
            const expectedStock = payload.products.reduce((sum, row) => sum + row.stock_base, 0);
            const expectedDebt = payload.customers.reduce((sum, row) => sum + row.current_debt, 0);
            if (productLinks.length !== payload.products.length
                || customerLinks.length !== payload.customers.length
                || historyCount !== payload.entries.length
                || stock !== expectedStock || debt !== expectedDebt
                || toSafeInteger(batch.counts.stock_base_total, 'Tổng tồn') !== stock
                || toSafeInteger(batch.counts.outstanding_debt, 'Tổng nợ') !== debt) {
                throw new Error(errorText);
            }
            return { products: productLinks.length, customers: customerLinks.length,
                entries: historyCount, stockBaseTotal: stock, outstandingDebt: debt };
        },
    };
    return Object.freeze(service);
}

export const legacyImportService = createLegacyImportService();
