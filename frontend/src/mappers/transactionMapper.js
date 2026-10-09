import { requireUuid } from '../services/serviceUtils.js';
import { toSafeInteger } from './numberMapper.js';

function mapItems(items, receiving = false) {
    if (!Array.isArray(items) || items.length < 1 || items.length > (receiving ? 500 : 200)) throw new Error('Số dòng hàng chưa hợp lệ.');
    return items.map(item => {
        if (typeof item.unitKey !== 'string' || !/^[a-z][a-z0-9_]{0,23}$/.test(item.unitKey)) throw new Error('Đơn vị hàng chưa hợp lệ.');
        const quantity = item.quantity;
        // Decimal sale quantities are needed for kg. PostgreSQL checks that
        // quantity * factor_to_base is an exact whole base-unit quantity.
        if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999 || !/^\d+(?:\.\d{1,3})?$/.test(String(quantity))) throw new Error('Số lượng chưa hợp lệ.');
        return {
            product_id: requireUuid(item.productId, 'Mặt hàng'), unit_key: item.unitKey, quantity,
            ...(receiving ? { unit_cost: toSafeInteger(item.unitCost, 'Giá nhập') } : {}),
        };
    });
}

export function mapSaleCommand(storeId, { requestId, items, paymentType = 'cash', customerId = null }) {
    if (!['cash', 'credit'].includes(paymentType)) throw new Error('Hình thức thanh toán chưa hợp lệ.');
    if (paymentType === 'credit') requireUuid(customerId, 'Khách mua chịu');
    if (paymentType === 'cash' && customerId !== null) throw new Error('Đơn tiền mặt không gắn khách mua chịu.');
    return {
        p_store_id: requireUuid(storeId, 'Cửa hàng'), p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
        p_items: mapItems(items), p_payment_type: paymentType, p_customer_id: customerId,
    };
}

export function mapStockCommand(storeId, { requestId, items, note = null }) {
    return {
        p_store_id: requireUuid(storeId, 'Cửa hàng'), p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
        p_items: mapItems(items, true), p_note: note,
    };
}

export function mapPaymentCommand(storeId, { requestId, customerId, amount, paymentMethod = 'cash', note = null }) {
    if (!['cash', 'bank', 'other'].includes(paymentMethod)) throw new Error('Phương thức trả nợ chưa hợp lệ.');
    return {
        p_store_id: requireUuid(storeId, 'Cửa hàng'), p_request_id: requireUuid(requestId, 'Mã yêu cầu'),
        p_customer_id: requireUuid(customerId, 'Khách hàng'), p_amount: toSafeInteger(amount, 'Tiền trả nợ', { min: 1 }),
        p_payment_method: paymentMethod, p_note: note,
    };
}

export function mapTransactionResult(row) {
    const result = {};
    const ids = { sale_id: 'saleId', receipt_id: 'receiptId', payment_id: 'paymentId' };
    const amounts = { total_amount: 'totalAmount', total_cost: 'totalCost', remaining_debt: 'remainingDebt' };
    for (const [key, mapped] of Object.entries(ids)) if (key in row) result[mapped] = row[key];
    for (const [key, mapped] of Object.entries(amounts)) if (key in row) result[mapped] = toSafeInteger(row[key], mapped);
    result.duplicate = row.duplicate === true;
    return result;
}
