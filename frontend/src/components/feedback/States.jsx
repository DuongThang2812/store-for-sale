import { PackageOpen, AlertCircle, RefreshCw } from 'lucide-react';

export function EmptyState({
    icon: Icon = PackageOpen,
    title = 'Chưa có thông tin',
    description = 'Thông tin sẽ xuất hiện tại đây khi có dữ liệu mới.',
    children
}) {
    return (
        <div className="empty-state" role="status">
            <span className="empty-state-icon" aria-hidden="true">
                <Icon size={44} strokeWidth={1.5} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
            {children && <div className="empty-state-actions">{children}</div>}
        </div>
    );
}

export function ErrorState({
    title = 'Có lỗi xảy ra',
    message = 'Không thể tải được dữ liệu vào lúc này. Vui lòng thử lại.',
    onRetry
}) {
    return (
        <div className="panel error-state-card" role="alert">
            <span className="error-state-icon" aria-hidden="true">
                <AlertCircle size={32} />
            </span>
            <div className="error-state-content">
                <h3>{title}</h3>
                <p>{message}</p>
            </div>
            {onRetry && (
                <button type="button" className="button secondary" onClick={onRetry}>
                    <RefreshCw size={16} /> Thử lại
                </button>
            )}
        </div>
    );
}

export function CardSkeleton({ count = 1 }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="panel skeleton-card" aria-hidden="true">
                    <div className="skeleton-line skeleton-title" />
                    <div className="skeleton-line skeleton-text" />
                    <div className="skeleton-line skeleton-sub" />
                </div>
            ))}
        </>
    );
}

export function TableRowSkeleton({ rows = 5, cols = 4 }) {
    return (
        <tbody className="skeleton-table-body" aria-hidden="true">
            {Array.from({ length: rows }).map((_, r) => (
                <tr key={r}>
                    {Array.from({ length: cols }).map((_, c) => (
                        <td key={c}>
                            <div className="skeleton-line skeleton-cell" />
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}
