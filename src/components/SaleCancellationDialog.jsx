import { useState } from 'react';
import { useShopStore } from '../stores/useShopStore';
import { cancellationPlan } from '../utils/saleCancellation';
import { formatCurrency } from '../utils/formatters';
import { Confirm, Modal } from './ui';

export function SaleCancellationDialog({ saleId, onClose, onDone }) {
    const state = useShopStore();
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [review, setReview] = useState(false);
    let plan, error;
    try { plan = cancellationPlan(state, saleId); } catch (e) { error = e.message; }
    if (error) return <Modal title="Chưa thể hủy đơn này" onClose={onClose}><p className="error" role="alert">{error}</p><p className="muted">Đơn mẫu cũ thiếu chi tiết hoàn kho sẽ không được tự điều chỉnh. Bạn có thể tạo một đơn mới để thử đầy đủ luồng hủy.</p><button className="button secondary full" onClick={onClose}>Đã hiểu</button></Modal>;
    const summary = <><div className="cancel-order-heading"><b>{plan.sale.title}</b><span>{new Date(plan.sale.date).toLocaleString('vi-VN')}</span></div><div className="cancel-summary"><div><span>Giá trị đơn hủy</span><strong>{formatCurrency(plan.sale.amount)}</strong></div><div><span>Giảm số nợ</span><strong>{formatCurrency(plan.debtReduction)}</strong></div><div><span>Tiền cần hoàn khách</span><strong className="text-red">{formatCurrency(plan.refundAmount)}</strong></div></div><h3>Hàng sẽ được hoàn vào kho</h3><ul className="cancel-stock-list">{plan.returned.map(row => <li key={row.productId}><span>{row.product.name}</span><b>+{row.quantity} {row.product.unit}</b></li>)}</ul></>;
    if (review) return <Confirm danger title="Xác nhận hủy toàn bộ đơn" label="Hủy đơn & hoàn kho" onClose={() => setReview(false)} onConfirm={() => { state.cancelSale(saleId, reason, confirmed); onDone('Đã hủy đơn, hoàn kho và điều chỉnh tiền/nợ. Lịch sử vẫn được giữ lại.'); }}><p>Hủy toàn bộ đơn này với lý do <b>{reason.trim()}</b>?</p><p>Giảm nợ {formatCurrency(plan.debtReduction)}; hoàn khách {formatCurrency(plan.refundAmount)}.</p><p>Đơn chỉ được hủy một lần.</p></Confirm>;
    return <Modal title="Hủy đơn bán nhầm" onClose={onClose}>{summary}<form onSubmit={e => { e.preventDefault(); setReview(true); }}><label className="field">Lý do hủy <span>*</span><textarea required maxLength={300} rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ví dụ: Chọn nhầm hàng, khách trả lại toàn bộ đơn"/></label><label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/> Tôi đã nhận lại đủ hàng{plan.refundAmount > 0 ? ` và hoàn ${formatCurrency(plan.refundAmount)} cho khách` : ''}.</label><div className="info-box">{plan.sale.kind === 'debt' ? 'Tiền khách đã trả được phân bổ từ khoản nợ cũ nhất. Phần chưa trả của đơn này sẽ được giảm nợ; phần đã trả sẽ hoàn lại khách.' : 'Đơn trả tiền ngay sẽ hoàn toàn bộ tiền cho khách và cộng lại hàng vào kho.'}</div><button type="submit" className="button danger full" disabled={!confirmed || !reason.trim()}>Xem xác nhận hủy đơn</button></form></Modal>;
}
