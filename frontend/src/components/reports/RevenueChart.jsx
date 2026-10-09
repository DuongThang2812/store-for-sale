import { memo, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';

const dateFormatter = new Intl.DateTimeFormat('vi-VN');
function compact(amount) {
    const absolute = Math.abs(amount);
    if (absolute >= 1000000) return `${Number((amount / 1000000).toFixed(1))} tr`;
    if (absolute >= 1000) return `${Number((amount / 1000).toFixed(1))} nghìn`;
    return `${amount}đ`;
}

export const RevenueChart = memo(function RevenueChart({ rows, metric, selectedKey, onSelect }) {
    const { top, bottom, range, zero } = useMemo(() => {
        const top = Math.ceil(Math.max(1, ...rows.flatMap(row => [row.revenue, row.received])) / 5) * 5;
        const bottom = Math.floor(Math.min(0, ...rows.flatMap(row => [row.revenue, row.received])) / 5) * 5;
        return { top, bottom, range: top - bottom, zero: -bottom / (top - bottom) * 100 };
    }, [rows]);
    const label = metric === 'revenue' ? 'Doanh thu bán hàng' : 'Tiền thực thu';
    return (
        <div className="chart-frame">
            <div className="chart-axis" aria-hidden="true">
                {[1, .75, .5, .25, 0].map(fraction => <span key={fraction}>{compact(bottom + (top - bottom) * fraction)}</span>)}
            </div>
            <div className="chart-scroll">
                <div className="chart-plot" style={{ minWidth: Math.max(440, rows.length * 44) }} role="group" aria-label={`${label} theo ngày`}>
                    {rows.map(row => (
                        <button type="button" key={row.key} className={`chart-column ${selectedKey === row.key ? 'selected' : ''}`}
                            aria-pressed={selectedKey === row.key}
                            aria-label={`${dateFormatter.format(row.date)}: ${formatCurrency(row[metric])}`}
                            onClick={() => onSelect(row.key)}>
                            <span className="chart-bar-area" aria-hidden="true">
                                <span className="chart-zero" style={{ bottom: `${zero}%` }}/>
                                <span className={`chart-bar ${metric} ${row[metric] < 0 ? 'negative' : ''}`}
                                    style={{ bottom: `${zero}%`, transform: `scaleY(${row[metric] / range})` }}/>
                            </span>
                            <span className="chart-day">{row.date.getDate()}/{row.date.getMonth() + 1}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
});

export const DailyRevenueTable = memo(function DailyRevenueTable({ rows }) {
    return (
        <section className="panel">
            <div className="panel-heading"><h2>Chi tiết từng ngày</h2><span className="stock-pill">{rows.length} ngày</span></div>
            <div className="table-scroll">
                <table className="data-table">
                    <thead><tr><th scope="col">Ngày</th><th scope="col">Doanh thu</th><th scope="col">Thực thu</th><th scope="col">Bán chịu</th><th scope="col">Thu nợ</th><th scope="col">Số đơn</th></tr></thead>
                    <tbody>{[...rows].reverse().map(row => (
                        <tr key={row.key}>
                            <td>{dateFormatter.format(row.date)}</td>
                            <td className="text-green"><strong>{formatCurrency(row.revenue)}</strong></td>
                            <td>{formatCurrency(row.received)}</td><td>{formatCurrency(row.debt)}</td>
                            <td>{formatCurrency(row.repayments)}</td><td>{row.count}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
        </section>
    );
});
