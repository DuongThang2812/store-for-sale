import { createBackup, validateSnapshot } from '../utils/backup.js';
import { debtBalances } from '../utils/saleCancellation.js';
import { isOpeningDebt } from '../utils/revenue.js';
import { localShopStorageKey } from './accountService.js';

const supportedPersistVersion = 0;
const saleKinds = new Set(['sale', 'debt']);

/** Read only the signed-in user's selected shop. Never inspect another browser key. */
export function readLegacyShop(userId, storeId, storage = globalThis.localStorage) {
    const key = localShopStorageKey(userId, storeId);
    const raw = storage.getItem(key);
    if (raw === null) return null;
    let persisted;
    try { persisted = JSON.parse(raw); }
    catch { throw new Error('Dữ liệu cũ trên máy không đọc được. Hãy tải bản sao lưu trước khi tiếp tục.'); }
    if (!persisted || persisted.version !== supportedPersistVersion || !persisted.state) {
        throw new Error('Phiên bản dữ liệu cũ chưa được hỗ trợ. Không thể tự chuyển lên hệ thống.');
    }
    return { key, version: persisted.version, state: validateSnapshot(persisted.state) };
}

/** A preflight report; it has no database side effects and never estimates unknown cost. */
export function inspectLegacySnapshot(input) {
    const state = validateSnapshot(input);
    const productIds = new Set(state.products.map(product => product.id));
    const customers = new Map(state.customers.map(customer => [customer.id, customer]));
    const sales = state.entries.filter(entry => saleKinds.has(entry.kind) && !isOpeningDebt(entry));
    const openingDebts = state.entries.filter(isOpeningDebt);
    const withItems = sales.filter(entry => Array.isArray(entry.items) && entry.items.length > 0);
    const archiveOnlySales = sales.filter(entry => !Array.isArray(entry.items) || entry.items.length === 0);
    const missingProductLines = withItems.flatMap(entry => entry.items
        .filter(item => !productIds.has(item.productId))
        .map(item => ({ saleId: entry.id, productId: item.productId ?? null, name: item.name })));
    const debtDiscrepancies = [];
    for (const customer of state.customers) {
        const ledger = [...debtBalances(state.entries, customer.id).values()].reduce((sum, amount) => sum + amount, 0);
        if (ledger !== customer.totalDebt) debtDiscrepancies.push({
            customerId: customer.id, customerName: customer.name,
            localBalance: customer.totalDebt, ledgerBalance: ledger,
        });
    }
    const removedCustomerIds = new Set(state.entries
        .filter(entry => entry.customerId && !customers.has(entry.customerId))
        .map(entry => entry.customerId));
    const orphanOutstanding = [...removedCustomerIds].filter(customerId =>
        [...debtBalances(state.entries, customerId).values()].some(amount => amount > 0)).length;
    const count = kind => state.entries.filter(entry => entry.kind === kind).length;
    return {
        counts: {
            products: state.products.length, customers: state.customers.length,
            sales: sales.length, salesWithItems: withItems.length,
            archiveOnlySales: archiveOnlySales.length, openingDebts: openingDebts.length,
            payments: count('payment'), receipts: count('stock'), cancellations: count('cancel'),
            adjustments: count('adjustment'), otherHistory: count('edit') + count('restore'),
        },
        totals: { outstandingDebt: state.customers.reduce((sum, customer) => sum + customer.totalDebt, 0) },
        review: { archiveOnlySaleIds: archiveOnlySales.map(entry => entry.id), missingProductLines,
            debtDiscrepancies, orphanOutstandingCustomerCount: orphanOutstanding,
            historicalCostUnknown: sales.length },
        needsManualReview: archiveOnlySales.length > 0 || missingProductLines.length > 0
            || debtDiscrepancies.length > 0 || orphanOutstanding > 0,
    };
}

/** Caller must offer the returned checksum-protected file for download before any import. */
export async function prepareLegacyMigration(userId, storeId, storage = globalThis.localStorage) {
    const legacy = readLegacyShop(userId, storeId, storage);
    if (!legacy) return null;
    const report = inspectLegacySnapshot(legacy.state);
    const backup = await createBackup(legacy.state, legacy.key);
    return { storageKey: legacy.key, persistVersion: legacy.version, report, backup };
}
