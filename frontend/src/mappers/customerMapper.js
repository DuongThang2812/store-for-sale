import { toSafeInteger } from './numberMapper.js';

export const mapCustomer = row => ({
    id: row.id, storeId: row.store_id, name: row.name, phone: row.phone ?? '', note: row.note ?? '',
    totalDebt: toSafeInteger(row.current_debt, 'Công nợ'), isInDebtBook: row.is_in_debt_book,
    lastTransactionAt: row.last_transaction_at,
    openInvoiceCount: toSafeInteger(row.open_invoice_count, 'Số hóa đơn'),
});
