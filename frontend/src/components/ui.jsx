import { memo, useState } from 'react';
import { ArrowLeft, Check, Minus, PackageOpen, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useListWindow } from '../hooks/useListWindow';
import { ListMore } from './ListMore';
import { formatCurrency, formatActivityTime } from '../utils/formatters';

export { PageHeader } from './navigation/PageHeader';
export { DataTable, Pagination } from './data-display/DataTable';
export { StatusBadge } from './data-display/StatusBadge';
export { MetricCard } from './cards/MetricCard';
export { EmptyState, ErrorState, CardSkeleton, TableRowSkeleton } from './feedback/States';
export { DangerConfirmDialog } from './feedback/DangerConfirmDialog';
export { ToastProvider } from './feedback/Toast';
export { Modal, Confirm } from './feedback/Dialog';

export function PageHeading({ title, description, action, back }) {
    return (
        <div className="page-heading">
            <div>
                {back && (
                    <Link className="back-link" to={back}>
                        <ArrowLeft size={17} /> Quay lại
                    </Link>
                )}
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
            {action}
        </div>
    );
}

export function SearchBox({ value, onChange, placeholder = 'Tìm tên hàng…' }) {
    return (
        <div className="search-box">
            <Search size={21} />
            <input
                aria-label={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />
            {value && (
                <button
                    className="icon-button"
                    aria-label="Xóa tìm kiếm"
                    onClick={() => onChange('')}
                    type="button"
                >
                    <X size={18} />
                </button>
            )}
        </div>
    );
}

export function Empty({ title = 'Chưa có thông tin', text = 'Thông tin sẽ xuất hiện tại đây.', children }) {
    return (
        <div className="empty-state" role="status">
            <PackageOpen size={40} />
            <h3>{title}</h3>
            <p>{text}</p>
            {children}
        </div>
    );
}

export function Stepper({ value, onChange, max, min = 0, label = 'Số lượng', step = 1, inputStep = step }) {
    const clamp = number => Math.max(min, Math.min(max ?? 999999, inputStep < 1 ? Number(number.toFixed(3)) : Math.floor(number)));
    return (
        <div className="stepper">
            <button
                type="button"
                aria-label={`Giảm ${label}`}
                disabled={value <= min}
                onClick={() => onChange(clamp(value - step))}
            >
                <Minus size={18} />
            </button>
            <input
                aria-label={label}
                inputMode={inputStep < 1 ? 'decimal' : 'numeric'}
                type="number"
                min={min}
                max={max}
                step={inputStep}
                value={value}
                onChange={e => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) onChange(clamp(n));
                }}
            />
            <button
                type="button"
                aria-label={`Tăng ${label}`}
                disabled={max !== undefined && value >= max}
                onClick={() => onChange(clamp(value + step))}
            >
                <Plus size={18} />
            </button>
        </div>
    );
}

export function Notice({ children, onClose, action }) {
    return (
        <div className="notice" role="status">
            <Check size={20} />
            <span>{children}</span>
            {action}
            {onClose && (
                <button className="icon-button" aria-label="Đóng thông báo" onClick={onClose} type="button">
                    <X size={18} />
                </button>
            )}
        </div>
    );
}

function ActivityItems({ items }) {
    const [open, setOpen] = useState(false);
    return (
        <details onToggle={event => setOpen(event.currentTarget.open)}>
            <summary>Xem các món hàng</summary>
            {open && items.map((item, index) => (
                <p key={index}>
                    {item.quantity} {item.unit || '×'} {item.name}{' '}
                    {(item.lineAmount !== undefined || item.price !== undefined) && (
                        <b>{formatCurrency(item.lineAmount ?? item.price * item.quantity)}</b>
                    )}
                </p>
            ))}
        </details>
    );
}

const ActivityRow = memo(function ActivityRow({ entry: e, onCancelSale }) {
    return (
        <div className="activity-row">
            <span className={`activity-dot ${e.kind}`}>
                <Check size={18} />
            </span>
            <div className="activity-text">
                <strong>{e.title}</strong>
                {e.cancelledAt && <span className="cancelled-badge">Đã hủy</span>}
                <p>{e.detail}{e.undone ? ' · Đã hoàn tác' : ''}</p>
                {e.kind === 'cancel' && (
                    <p>Giảm nợ: {formatCurrency(e.debtReduction)} · Hoàn tiền: {formatCurrency(e.refundAmount)}</p>
                )}
                {e.purchaseTotal !== undefined && (
                    <span className="activity-purchase">Tiền nhập hàng: {formatCurrency(e.purchaseTotal)}</span>
                )}
                {e.items && <ActivityItems items={e.items} />}
                {onCancelSale && e.canCancel !== false && ['sale', 'debt'].includes(e.kind) && !e.cancelledAt && (
                    <button className="cancel-sale-button" onClick={() => onCancelSale(e.id)} type="button">
                        Hủy đơn
                    </button>
                )}
            </div>
            <div className="activity-meta">
                {e.amount > 0 && (
                    <strong className={e.kind === 'cancel' ? 'text-red' : e.kind === 'debt' ? 'text-amber' : 'text-green'}>
                        {e.kind === 'cancel' ? '−' : e.kind === 'debt' ? '' : '+'}{formatCurrency(e.amount)}
                    </strong>
                )}
                <span>{formatActivityTime(e.date)}</span>
            </div>
        </div>
    );
});

export function ActivityList({ entries, onCancelSale, resetKey = '' }) {
    const { visible, showMore, hasMore } = useListWindow(entries, resetKey, 40);
    if (!entries.length) return <Empty title="Chưa có hoạt động" text="Các lần bán hàng, nhập hàng và trả nợ sẽ được ghi lại ở đây." />;
    return (
        <div className="activity-list">
            {visible.map(entry => (
                <ActivityRow key={entry.id} entry={entry} onCancelSale={onCancelSale} />
            ))}
            <ListMore shown={visible.length} total={entries.length} onMore={showMore} hasMore={hasMore} />
        </div>
    );
}
