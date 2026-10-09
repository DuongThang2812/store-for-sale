import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChartColumnIncreasing, Download, ShoppingBasket, Wallet } from 'lucide-react';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { useAccountStore } from '../stores/useAccountStore';
import { reportService } from '../services/reportService';
import { PageHeading } from '../components/ui';
import { formatCurrency } from '../utils/formatters';
import { exportCsv } from '../utils/shopHelpers';
import { RevenueChart, DailyRevenueTable } from '../components/reports/RevenueChart';
import { summarizeRevenue } from '../utils/revenue';
import { formatGrossMargin } from '../utils/reportDisplay.js';
import { reportScopeMatches } from '../domain/reportScope.js';

export function RevenuePage() {
    const { entries, customers } = useActiveShopStore(useShallow(s => ({ entries: s.entries, customers: s.customers })));
    const store = useAccountStore(s => s.store);
    const dataMode = useAccountStore(s => s.dataMode);
    const user = useAccountStore(s => s.user);
    const [days, setDays] = useState(7);
    const [metric, setMetric] = useState('revenue');
    const [selectedDay, setSelectedDay] = useState(null);
    const today = new Date().toDateString();
    const local = useMemo(() => summarizeRevenue(entries, days, new Date(today)), [entries, days, today]);
    const [remoteState, setRemoteState] = useState(null);
    const [reload, setReload] = useState(0);
    const reportKey = `${store?.id || ''}:${days}:${reload}`;
    useEffect(() => {
        if (dataMode !== 'supabase' || store?.role !== 'owner') return;
        let active = true;
        reportService.getRevenue(store.id, days)
            .then(value => { if (active && useAccountStore.getState().user === user) setRemoteState({ user, storeId: store.id, revision: reportKey, value, error: '' }); })
            .catch(() => { if (active && useAccountStore.getState().user === user) setRemoteState({ user, storeId: store.id, revision: reportKey, value: null, error: 'Chưa tải được báo cáo từ DB. Vui lòng thử lại.' }); });
        return () => { active = false; };
    }, [dataMode, store?.id, store?.role, days, reportKey, user]);
    const matches = reportScopeMatches(remoteState, { user, storeId: store?.id, role: store?.role, dataMode, revision: reportKey });
    const remote = matches ? remoteState.value : null;
    const remoteError = matches ? remoteState.error : '';
    const rows = dataMode === 'supabase' ? remote?.rows ?? [] : local.rows;
    const totals = dataMode === 'supabase' ? remote?.totals : local.totals;
    const currentDebt = dataMode === 'supabase' ? remote?.totals.currentDebt : customers.reduce((sum, c) => sum + c.totalDebt, 0);
    const day = rows.find(row => row.key === selectedDay) || rows.at(-1);
    const metricLabel = metric === 'revenue' ? 'Doanh thu bán hàng' : 'Tiền thực thu';
    const exportReport = () => exportCsv('doanh-thu.csv', [
        ['Ngày', 'Doanh thu bán hàng', 'Tiền thực thu', 'Bán chịu', 'Tiền thu nợ', 'Số đơn', ...(dataMode === 'supabase' ? ['Giá vốn', 'Lợi nhuận gộp'] : [])],
        ...rows.map(row => [row.date.toLocaleDateString('vi-VN'), row.revenue, row.received, row.debt, row.repayments, row.count,
            ...(dataMode === 'supabase' ? [row.cogs ?? '', row.grossProfit ?? ''] : [])]),
    ]);
    if (dataMode === 'supabase' && store?.role !== 'owner') return <><PageHeading title="Biểu đồ & doanh thu"/><div className="info-box">Chỉ chủ tiệm được xem doanh thu, giá vốn và lợi nhuận.</div></>;
    if (dataMode === 'supabase' && !remote) return <><PageHeading title="Biểu đồ & doanh thu"/>{remoteError ? <div className="panel"><p className="error">{remoteError}</p><button className="button secondary" onClick={() => setReload(value => value + 1)}>Thử lại</button></div> : <div className="panel" role="status">Đang tải số liệu từ DB…</div>}</>;
    return <>
        <PageHeading title="Biểu đồ & doanh thu" description="Xem tiệm bán được bao nhiêu và đã nhận về bao nhiêu tiền." action={<button className="button secondary" onClick={exportReport}><Download size={19}/> Tải báo cáo</button>}/>
        <div className="report-toolbar"><div className="filter-tabs" aria-label="Khoảng thời gian">{[7, 30, 90].map(value => <button key={value} className={days === value ? 'selected' : ''} aria-pressed={days === value} onClick={() => { setDays(value); setSelectedDay(null); }}>{value} ngày gần đây</button>)}</div><span>{rows[0].date.toLocaleDateString('vi-VN')} – {rows.at(-1).date.toLocaleDateString('vi-VN')}</span></div>
        <section className="report-cards">
            <article className="panel report-card"><span className="quick-icon green"><ChartColumnIncreasing size={25}/></span><p>Doanh thu bán hàng</p><strong>{formatCurrency(totals.revenue)}</strong><small>Gồm trả ngay và mua chịu</small></article>
            <article className="panel report-card"><span className="quick-icon blue"><Wallet size={25}/></span><p>Tiền thực thu</p><strong>{formatCurrency(totals.received)}</strong><small>Bán trả ngay + nhận trả nợ</small></article>
            <article className="panel report-card"><span className="quick-icon orange"><BookOpen size={25}/></span><p>Khách đang còn nợ</p><strong>{formatCurrency(currentDebt)}</strong><small>Số dư hiện tại của toàn bộ khách</small></article>
            <article className="panel report-card"><span className="quick-icon purple"><ShoppingBasket size={25}/></span><p>Số đơn bán hàng</p><strong>{totals.count.toLocaleString('vi-VN')} <span>đơn</span></strong><small>Trong {days} ngày đã chọn</small></article>
            {dataMode === 'supabase' && <><article className="panel report-card"><span className="quick-icon blue"><Wallet size={25}/></span><p>Giá vốn</p><strong>{totals.cogs === null ? 'Chưa đủ dữ liệu' : formatCurrency(totals.cogs)}</strong><small>Giá vốn của các dòng bán trong kỳ</small></article><article className="panel report-card"><span className="quick-icon green"><ChartColumnIncreasing size={25}/></span><p>Lợi nhuận gộp</p><strong>{totals.grossProfit === null ? 'Chưa đủ dữ liệu' : formatCurrency(totals.grossProfit)}</strong><small>Doanh thu trừ giá vốn đã ghi nhận</small></article><article className="panel report-card"><p>Tỷ suất lợi nhuận gộp</p><strong>{formatGrossMargin(totals.grossMarginPercent)}</strong><small>{totals.cogs === null ? 'Chưa đủ dữ liệu giá vốn' : totals.revenue === 0 ? 'Không có doanh thu để tính tỷ suất' : 'Lợi nhuận gộp / doanh thu × 100%'}</small></article></>}
        </section>
        <section className="panel revenue-chart"><div className="panel-heading"><div><h2>Tình hình bán hàng từng ngày</h2><p>Chạm vào cột để xem số tiền của ngày đó.</p></div><label className="chart-metric">Hiển thị<select value={metric} onChange={e => setMetric(e.target.value)}><option value="revenue">Doanh thu bán hàng</option><option value="received">Tiền thực thu</option></select></label></div>
            <div className="chart-detail" role="status"><span>{day.date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}</span><strong>{metricLabel}: {formatCurrency(day[metric])}</strong><span>{day.count} đơn · Thu nợ: {formatCurrency(day.repayments)}</span></div>
            <RevenueChart rows={rows} metric={metric} selectedKey={day.key} onSelect={setSelectedDay}/>

            {!totals.revenue && !totals.received && <p className="page-hint">Chưa có giao dịch trong khoảng thời gian này.</p>}
        </section>
        <div className="info-box report-explanation"><b>Đọc số tiền cho đúng</b><p>Doanh thu là giá trị hàng đã bán, kể cả mua chịu. Tiền khách trả nợ chỉ cộng vào tiền thực thu; không cộng doanh thu lần nữa. Đơn hủy giảm doanh thu vào ngày hủy; tiền hoàn khách giảm thực thu vào ngày hoàn. Số nợ đầu kỳ không được tính là doanh thu mới. {dataMode === 'supabase' ? 'Lợi nhuận gộp chỉ hiện khi tất cả dòng hàng trong kỳ có giá vốn xác định; chưa trừ chi phí vận hành.' : 'Đây chưa phải lợi nhuận vì chưa trừ giá vốn và chi phí.'}</p></div>
        <DailyRevenueTable rows={rows}/>

    </>;
}

