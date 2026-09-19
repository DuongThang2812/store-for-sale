import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleHelp, Minus, PackageOpen, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
export function PageHeading({ title, description, action, back }) {
    return <div className="page-heading"><div>{back && <Link className="back-link" to={back}><ArrowLeft size={17}/> Quay lại</Link>}<h1>{title}</h1><p>{description}</p></div>{action}</div>;
}
export function SearchBox({ value, onChange, placeholder = 'Tìm tên hàng…' }) {
    return <div className="search-box"><Search size={21}/><input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>{value && <button className="icon-button" aria-label="Xóa tìm kiếm" onClick={() => onChange('')}><X size={18}/></button>}</div>;
}
export function Empty({ title = 'Chưa có thông tin', text = 'Thông tin sẽ xuất hiện tại đây.', children }) {
    return <div className="empty-state"><PackageOpen size={40}/><h3>{title}</h3><p>{text}</p>{children}</div>;
}
export function Stepper({ value, onChange, max, min = 0, label = 'Số lượng' }) {
    return <div className="stepper"><button type="button" aria-label={`Giảm ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={18}/></button><input aria-label={label} inputMode="numeric" type="number" min={min} max={max} value={value} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n))
        onChange(Math.max(min, Math.min(max ?? 999999, Math.floor(n)))); }}/><button type="button" aria-label={`Tăng ${label}`} disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)}><Plus size={18}/></button></div>;
}
export function Modal({ title, onClose, children }) {
    const ref = useRef(null);
    useEffect(() => { const d = ref.current; const prior = document.activeElement; d.showModal(); return () => { d.close(); prior?.focus(); }; }, []);
    return <dialog className="modal" ref={ref} onCancel={e => { e.preventDefault(); onClose(); }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng"><X /></button></div>{children}</dialog>;
}
export function Confirm({ title, children, onClose, onConfirm, label = 'Xác nhận', danger = false }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    return <Modal title={title} onClose={() => { if (!busy)
        onClose(); }}><div className="confirm-symbol"><CircleHelp size={30}/></div><div className="confirm-body">{children}</div>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Quay lại</button><button className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={async () => { if (lock.current)
        return; lock.current = true; setBusy(true); try {
        await onConfirm();
    }
    catch (e) {
        setError(e.message);
        setBusy(false);
        lock.current = false;
    } }}>{busy ? 'Đang lưu…' : label}</button></div></Modal>;
}
export function Notice({ children, onClose, action }) {
    return <div className="notice" role="status"><Check size={20}/><span>{children}</span>{action}{onClose && <button className="icon-button" aria-label="Đóng thông báo" onClick={onClose}><X size={18}/></button>}</div>;
}
export function ActivityList({ entries, onCancelSale }) {
    if (!entries.length)
        return <Empty title="Chưa có hoạt động" text="Các lần bán hàng, nhập hàng và trả nợ sẽ được ghi lại ở đây."/>;
    return <div className="activity-list">{entries.map(e => <div className="activity-row" key={e.id}><span className={`activity-dot ${e.kind}`}><Check size={18}/></span><div className="activity-text"><strong>{e.title}</strong>{e.cancelledAt && <span className="cancelled-badge">Đã hủy</span>}<p>{e.detail}{e.undone ? ' · Đã hoàn tác' : ''}</p>{e.kind === 'cancel' && <p>Giảm nợ: {formatCurrency(e.debtReduction)} · Hoàn tiền: {formatCurrency(e.refundAmount)}</p>}{e.purchaseTotal !== undefined && <span className="activity-purchase">Tiền nhập hàng: {formatCurrency(e.purchaseTotal)}</span>}{e.items && <details><summary>Xem các món hàng</summary>{e.items.map((i, n) => <p key={n}>{i.quantity} {i.unit || '×'} {i.name} <b>{formatCurrency(i.price * i.quantity)}</b></p>)}</details>}{onCancelSale && ['sale', 'debt'].includes(e.kind) && !e.cancelledAt && <button className="cancel-sale-button" onClick={() => onCancelSale(e.id)}>Hủy đơn</button>}</div><div className="activity-meta">{e.amount > 0 && <strong className={e.kind === 'cancel' ? 'text-red' : e.kind === 'debt' ? 'text-amber' : 'text-green'}>{e.kind === 'cancel' ? '−' : e.kind === 'debt' ? '' : '+'}{formatCurrency(e.amount)}</strong>}<span>{new Date(e.date).toLocaleDateString('vi-VN')} · {new Date(e.date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div></div>)}</div>;
}
