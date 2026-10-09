import { useEffect, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { salesService } from '../services/salesService';
import { toSafeInteger } from '../mappers/numberMapper';
import { formatCurrency } from '../utils/formatters';
import { Confirm, Modal } from './ui';

export function CloudSaleCancellationDialog({ saleId, onClose, onDone }) {
    const store = useAccountStore(state => state.store);
    const cancelSale = useActiveShopStore(state => state.cancelSale);
    const [remote, setRemote] = useState(null);
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [review, setReview] = useState(false);
    useEffect(() => {
        let active = true;
        if (store.role === 'owner') void salesService.previewCancellation(store.id, saleId)
            .then(plan => { if (active) setRemote({ plan }); })
            .catch(error => { if (active) setRemote({ error: error.message }); });
        return () => { active = false; };
    }, [store.id, store.role, saleId]);
    if (store.role !== 'owner' || remote?.error) return <Modal title="Chưa thể hủy đơn" onClose={onClose}>
        <p className="error" role="alert">{remote?.error || 'Chỉ chủ tiệm được hủy đơn.'}</p>
        <button className="button secondary full" onClick={onClose}>Đóng</button></Modal>;
    if (!remote) return <Modal title="Thông tin hủy đơn" onClose={onClose}><p role="status">Đang đọc đơn và công nợ từ DB…</p></Modal>;
    const plan = remote.plan;
    const debt = toSafeInteger(plan.debt_reduction, 'Giảm nợ');
    const refund = toSafeInteger(plan.refund_amount, 'Tiền hoàn');
    if (review) return <Confirm danger title="Xác nhận hủy toàn bộ đơn" label="Hủy đơn & hoàn kho"
        onClose={() => setReview(false)} onConfirm={async () => {
            await cancelSale(saleId, reason, confirmed, plan.preview_token);
            onDone('Đã hủy đơn trên DB, hoàn kho và điều chỉnh tiền/nợ. Lịch sử vẫn được giữ lại.');
        }}><p>Lý do: <b>{reason.trim()}</b>.</p><p>Giảm nợ {formatCurrency(debt)}; hoàn khách {formatCurrency(refund)}.</p>
        <p>Nếu số nợ thay đổi trong lúc xác nhận, DB sẽ dừng để bạn kiểm tra lại.</p></Confirm>;
    return <Modal title="Hủy đơn bán nhầm" onClose={onClose}>
        <div className="cancel-summary"><div><span>Giá trị đơn</span><strong>{formatCurrency(toSafeInteger(plan.total_amount, 'Giá trị đơn'))}</strong></div>
            <div><span>Giảm số nợ</span><strong>{formatCurrency(debt)}</strong></div>
            <div><span>Tiền cần hoàn khách</span><strong className="text-red">{formatCurrency(refund)}</strong></div></div>
        <h3>Hàng sẽ được hoàn vào kho</h3><ul className="cancel-stock-list">{plan.items.map((item, index) => <li key={`${item.product_id}:${index}`}>
            <span>{item.name}</span><b>+{item.quantity_base} {item.base_unit}</b></li>)}</ul>
        <form onSubmit={event => { event.preventDefault(); setReview(true); }}>
            <label className="field">Lý do hủy<textarea required maxLength={300} rows={3} value={reason} onChange={event => setReason(event.target.value)}/></label>
            <label className="checkbox-field"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
                Tôi đã nhận lại đủ hàng{refund > 0 ? ` và hoàn ${formatCurrency(refund)} cho khách` : ''}.</label>
            <button className="button danger full" disabled={!confirmed || !reason.trim()}>Xem xác nhận hủy đơn</button>
        </form></Modal>;
}
