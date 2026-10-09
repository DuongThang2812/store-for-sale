import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TableRowSkeleton, EmptyState } from '../feedback/States';

export function Pagination({ offset = 0, limit = 20, total = 0, onChange }) {
    if (total <= limit) return null;

    const from = total > 0 ? offset + 1 : 0;
    const to = Math.min(offset + limit, total);
    const hasPrev = offset > 0;
    const hasNext = offset + limit < total;

    return (
        <div className="table-pagination" role="navigation" aria-label="Phân trang">
            <span className="pagination-info">
                Hiển thị <strong>{from}–{to}</strong> trên <strong>{total}</strong>
            </span>
            <div className="pagination-buttons">
                <button
                    type="button"
                    className="button secondary sm"
                    disabled={!hasPrev}
                    onClick={() => onChange(Math.max(0, offset - limit))}
                    aria-label="Trang trước"
                >
                    <ChevronLeft size={16} /> Trước
                </button>
                <button
                    type="button"
                    className="button secondary sm"
                    disabled={!hasNext}
                    onClick={() => onChange(offset + limit)}
                    aria-label="Trang sau"
                >
                    Sau <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}

export function DataTable({
    columns,
    data = [],
    loading = false,
    emptyTitle = 'Chưa có dữ liệu',
    emptyText = 'Thông tin sẽ hiển thị ở đây khi có dữ liệu mới.',
    emptyIcon,
    keyExtractor = (row, index) => row.id || index,
    className = ''
}) {
    return (
        <div className={`data-table-wrapper panel ${className}`}>
            <div className="table-scroll">
                <table className="data-table">
                    <thead>
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={col.key || idx}
                                    style={col.width ? { width: col.width } : undefined}
                                    className={col.className || ''}
                                    scope="col"
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    {loading ? (
                        <TableRowSkeleton rows={5} cols={columns.length} />
                    ) : data.length === 0 ? (
                        <tbody>
                            <tr>
                                <td colSpan={columns.length} className="table-empty-cell">
                                    <EmptyState
                                        icon={emptyIcon}
                                        title={emptyTitle}
                                        description={emptyText}
                                    />
                                </td>
                            </tr>
                        </tbody>
                    ) : (
                        <tbody>
                            {data.map((row, rIdx) => (
                                <tr key={keyExtractor(row, rIdx)}>
                                    {columns.map((col, cIdx) => (
                                        <td key={col.key || cIdx} className={col.cellClassName || ''}>
                                            {col.render ? col.render(row, rIdx) : row[col.key]}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    )}
                </table>
            </div>
        </div>
    );
}
