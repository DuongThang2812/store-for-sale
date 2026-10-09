import { toSafeInteger } from './numberMapper.js';

export function mapActivityEvent(row) {
    if (row.legacy) return { ...row.source_entry, id: row.id, date: row.date,
        customerId: row.customer_id, legacy: true, canCancel: false,
        detail: `Lịch sử cũ · ${row.source_entry.detail || ''}` };
    return {
        id: row.id, kind: row.kind, title: row.title, detail: row.detail || '', date: row.date,
        amount: toSafeInteger(row.amount ?? 0, 'Tiền giao dịch'), customerId: row.customer_id,
        productId: row.product_id, saleId: row.sale_id, cancelledAt: row.cancelled_at,
        canCancel: row.can_cancel === true,
        ...(row.refund_amount != null ? { refundAmount: toSafeInteger(row.refund_amount, 'Tiền hoàn'),
            debtReduction: toSafeInteger(row.debt_reduction, 'Giảm nợ') } : {}),
        ...(row.purchase_total != null ? { purchaseTotal: toSafeInteger(row.purchase_total, 'Tiền nhập') } : {}),
        items: row.items?.map(item => ({ productId: item.product_id, name: item.name,
            quantity: Number(item.quantity), unit: item.unit,
            ...(item.price != null ? { price: toSafeInteger(item.price, 'Đơn giá') } : {}),
            ...(item.line_amount != null ? { lineAmount: toSafeInteger(item.line_amount, 'Thành tiền') } : {}),
            ...(item.stock_quantity != null ? { stockQuantity: toSafeInteger(item.stock_quantity, 'Số lượng') } : {}),
        })),
    };
}
