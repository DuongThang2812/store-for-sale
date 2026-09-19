import { useState } from 'react';
import { BookOpen, ChartColumnIncreasing, Download, ShoppingBasket, Wallet } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { PageHeading } from '../components/ui';
import { formatCurrency } from '../utils/formatters';
import { exportCsv } from '../utils/shopHelpers';
import { summarizeRevenue } from '../utils/revenue';

export function RevenuePage() {
    const { entries, customers } = useShopStore();
    const [days, setDays] = useState(7);
    const [metric, setMetric] = useState('revenue');
    const [selectedDay, setSelectedDay] = useState(null);
    const { rows, totals } = summarizeRevenue(entries, days);
    const currentDebt = customers.reduce((sum, c) => sum + c.totalDebt, 0);
    const max = Math.max(...rows.map(row => Math.max(row.revenue, row.received)), 1);
    const chartTop = Math.ceil(max / 5) * 5;
    const chartBottom = Math.floor(Math.min(0, ...rows.map(row => Math.min(row.revenue, row.received))) / 5) * 5;
    const chartRange = chartTop - chartBottom;
    const zero = -chartBottom / chartRange * 100;
    const day = rows.find(row => row.key === selectedDay) || rows.at(-1);
    const metricLabel = metric === 'revenue' ? 'Doanh thu bán hàng' : 'Tiền thực thu';
    const compact = amount => amount >= 1000000 ? `${Number((amount / 1000000).toFixed(1))} tr` : amount >= 1000 ? `${Number((amount / 1000).toFixed(1))} nghìn` : `${amount}đ`;
    const exportReport = () => exportCsv('doanh-thu.csv', [['Ngày', 'Doanh thu bán hàng', 'Tiền thực thu', 'Bán chịu', 'Tiền thu nợ', 'Số đơn'], ...rows.map(row => [row.date.toLocaleDateString('vi-VN'), row.revenue, row.received, row.debt, row.repayments, row.count])]);
    return <>
        <PageHeading title="Biểu đồ & doanh thu" description="Xem tiệm bán được bao nhiêu và đã nhận về bao nhiêu tiền." action={<button className="button secondary" onClick={exportReport}><Download size={19}/> Tải báo cáo</button>}/>
        <div className="report-toolbar"><div className="filter-tabs" aria-label="Khoảng thời gian">{[7, 30, 90].map(value => <button key={value} className={days === value ? 'selected' : ''} aria-pressed={days === value} onClick={() => { setDays(value); setSelectedDay(null); }}>{value} ngày gần đây</button>)}</div><span>{rows[0].date.toLocaleDateString('vi-VN')} – {rows.at(-1).date.toLocaleDateString('vi-VN')}</span></div>
        <section className="report-cards">
            <article className="panel report-card"><span className="quick-icon green"><ChartColumnIncreasing size={25}/></span><p>Doanh thu bán hàng</p><strong>{formatCurrency(totals.revenue)}</strong><small>Gồm trả ngay và mua chịu</small></article>
            <article className="panel report-card"><span className="quick-icon blue"><Wallet size={25}/></span><p>Tiền thực thu</p><strong>{formatCurrency(totals.received)}</strong><small>Bán trả ngay + nhận trả nợ</small></article>
            <article className="panel report-card"><span className="quick-icon orange"><BookOpen size={25}/></span><p>Khách đang còn nợ</p><strong>{formatCurrency(currentDebt)}</strong><small>Số dư hiện tại của toàn bộ khách</small></article>
            <article className="panel report-card"><span className="quick-icon purple"><ShoppingBasket size={25}/></span><p>Số đơn bán hàng</p><strong>{totals.count.toLocaleString('vi-VN')} <span>đơn</span></strong><small>Trong {days} ngày đã chọn</small></article>
        </section>
        <section className="panel revenue-chart"><div className="panel-heading"><div><h2>Tình hình bán hàng từng ngày</h2><p>Chạm vào cột để xem số tiền của ngày đó.</p></div><label className="chart-metric">Hiển thị<select value={metric} onChange={e => setMetric(e.target.value)}><option value="revenue">Doanh thu bán hàng</option><option value="received">Tiền thực thu</option></select></label></div>
            <div className="chart-detail" role="status"><span>{day.date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</span><strong>{metricLabel}: {formatCurrency(day[metric])}</strong><span>{day.count} đơn · Thu nợ: {formatCurrency(day.repayments)}</span></div>
            <div className="chart-frame"><div className="chart-axis" aria-hidden="true">{[1, .75, .5, .25, 0].map(fraction => <span key={fraction}>{compact(chartBottom + chartRange * fraction)}</span>)}</div><div className="chart-scroll"><div className="chart-plot" style={{ minWidth: `${Math.max(440, days * 44)}px` }} role="group" aria-label={`${metricLabel} theo ngày`}>{rows.map(row => <button key={row.key} className={`chart-column ${day.key === row.key ? 'selected' : ''}`} aria-pressed={day.key === row.key} aria-label={`${row.date.toLocaleDateString('vi-VN')}: ${formatCurrency(row[metric])}`} onClick={() => setSelectedDay(row.key)}><span className="chart-bar-area"><span className="chart-zero" style={{ bottom: `${zero}%` }}/><span className={`chart-bar ${metric} ${row[metric] < 0 ? "negative" : ""}`} style={{ bottom: `${row[metric] >= 0 ? zero : zero - Math.abs(row[metric]) / chartRange * 100}%`, height: `${Math.abs(row[metric]) / chartRange * 100}%` }}/></span><span className="chart-day">{row.date.getDate()}/{row.date.getMonth() + 1}</span></button>)}</div></div></div>
            {!totals.revenue && !totals.received && <p className="page-hint">Chưa có giao dịch trong khoảng thời gian này.</p>}
        </section>
        <div className="info-box report-explanation"><b>Đọc số tiền cho đúng</b><p>Doanh thu là giá trị hàng đã bán, kể cả mua chịu. Tiền khách trả nợ chỉ cộng vào tiền thực thu; không cộng doanh thu lần nữa. Đơn hủy giảm doanh thu vào ngày hủy; tiền hoàn khách giảm thực thu vào ngày hoàn, nên một ngày có thể có số âm. Số đơn không gồm đơn đã hủy. Các khoản “Số nợ ban đầu” không được tính là doanh thu mới. Đây chưa phải lợi nhuận vì chưa trừ giá vốn và chi phí.</p></div>
        <section className="panel"><div className="panel-heading"><h2>Chi tiết từng ngày</h2><span className="stock-pill">{days} ngày</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Ngày</th><th>Doanh thu</th><th>Thực thu</th><th>Bán chịu</th><th>Thu nợ</th><th>Số đơn</th></tr></thead><tbody>{[...rows].reverse().map(row => <tr key={row.key}><td>{row.date.toLocaleDateString('vi-VN')}</td><td className="text-green"><strong>{formatCurrency(row.revenue)}</strong></td><td>{formatCurrency(row.received)}</td><td>{formatCurrency(row.debt)}</td><td>{formatCurrency(row.repayments)}</td><td>{row.count}</td></tr>)}</tbody></table></div></section>
    </>;
}

