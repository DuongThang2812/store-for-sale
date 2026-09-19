import { saleOptions } from './productPricing.js';

// Replay oldest first. Explicit allocations keep later cancellations from moving
// historical repayments onto another invoice.
export function debtBalances(entries, customerId) {
    const balances = new Map();
    for (const entry of [...entries].reverse()) {
        if (entry.customerId !== customerId) continue;
        if (entry.kind === 'debt') balances.set(entry.id, entry.amount);
        if (entry.kind === 'payment') {
            if (entry.allocations) {
                for (const part of entry.allocations) balances.set(part.debtId, Math.max(0, (balances.get(part.debtId) || 0) - part.amount));
            } else {
                let remaining = entry.amount;
                for (const [id, balance] of balances) {
                    const paid = Math.min(balance, remaining);
                    balances.set(id, balance - paid); remaining -= paid;
                    if (!remaining) break;
                }
            }
        }
        if (entry.kind === 'cancel' && entry.saleId) balances.set(entry.saleId, 0);
    }
    return balances;
}
export function allocatePayment(entries, customerId, amount) {
    let remaining = amount;
    const allocations = [];
    for (const [debtId, balance] of debtBalances(entries, customerId)) {
        const paid = Math.min(balance, remaining);
        if (paid > 0) allocations.push({ debtId, amount: paid });
        remaining -= paid;
        if (!remaining) break;
    }
    if (remaining) throw new Error('Lịch sử nợ chưa khớp số dư. Hãy kiểm tra lại trước khi nhận tiền.');
    return allocations;
}
export function cancellationPlan(state, saleId) {
    const sale = state.entries.find(e => e.id === saleId);
    if (!sale || !['sale', 'debt'].includes(sale.kind)) throw new Error('Không tìm thấy đơn bán hàng.');
    if (sale.cancelledAt || state.entries.some(e => e.kind === 'cancel' && e.saleId === saleId)) throw new Error('Đơn này đã hủy, không thể hủy lần nữa.');
    if (!sale.items?.length) throw new Error('Đơn cũ không có chi tiết mặt hàng nên không thể tự hoàn kho.');
    const returned = new Map();
    let total = 0;
    for (const item of sale.items) {
        const product = state.products.find(p => p.id === item.productId);
        if (!product || !Number.isSafeInteger(item.stockQuantity) || item.stockQuantity <= 0) throw new Error('Đơn cũ thiếu thông tin quy đổi để hoàn hàng.');
        if (item.stockUnit ? item.stockUnit !== product.unit : !saleOptions(product).some(o => o.unit === item.unit && o.factor * item.quantity === item.stockQuantity)) throw new Error(`Quy cách “${item.name}” đã thay đổi. Không thể tự hoàn về đơn vị hiện tại.`);
        const count = (returned.get(product.id) || 0) + item.stockQuantity;
        if (!Number.isSafeInteger(product.stock + count)) throw new Error('Số tồn sau khi hoàn hàng quá lớn.');
        returned.set(product.id, count);
        total += item.quantity * item.price;
    }
    if (total !== sale.amount) throw new Error('Tổng tiền đơn không khớp các mặt hàng. Vui lòng kiểm tra lịch sử.');
    let debtReduction = 0;
    if (sale.kind === 'debt') {
        debtReduction = debtBalances(state.entries, sale.customerId).get(saleId) || 0;
        const customer = state.customers.find(c => c.id === sale.customerId);
        if (debtReduction > (customer?.totalDebt || 0)) throw new Error('Số dư nợ không khớp lịch sử, chưa thể hủy đơn.');
    }
    return { sale, returned: [...returned].map(([productId, quantity]) => ({ productId, quantity, product: state.products.find(p => p.id === productId) })), debtReduction, refundAmount: sale.amount - debtReduction };
}
export function applySaleCancellation(state, saleId, reason, confirmed, now = new Date().toISOString(), id = crypto.randomUUID()) {
    if (!reason?.trim() || reason.trim().length > 300) throw new Error('Nhập lý do hủy từ 1 đến 300 ký tự.');
    if (!confirmed) throw new Error('Xác nhận đã nhận lại hàng và hoàn tiền cần trả trước khi hủy.');
    const plan = cancellationPlan(state, saleId);
    const quantities = new Map(plan.returned.map(row => [row.productId, row.quantity]));
    const customers = state.customers.map(c => c.id === plan.sale.customerId ? { ...c, totalDebt: c.totalDebt - plan.debtReduction, lastTransactionAt: now } : c).filter(c => c.id !== plan.sale.customerId || c.totalDebt > 0);
    const debtCarts = { ...state.debtCarts };
    if (plan.sale.customerId && !customers.some(c => c.id === plan.sale.customerId)) delete debtCarts[plan.sale.customerId];
    return {
        products: state.products.map(p => ({ ...p, stock: p.stock + (quantities.get(p.id) || 0) })), customers, debtCarts,
        entries: [{ id, kind: 'cancel', saleId, originalKind: plan.sale.kind, customerId: plan.sale.customerId, title: 'Hủy đơn · ' + plan.sale.title, detail: reason.trim(), amount: plan.sale.amount, refundAmount: plan.refundAmount, debtReduction: plan.debtReduction, date: now, items: plan.sale.items }, ...state.entries.map(e => e.id === saleId ? { ...e, cancelledAt: now, cancellationId: id } : e)],
    };
}
