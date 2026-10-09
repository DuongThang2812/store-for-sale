import { Link } from 'react-router-dom';
import { formatCurrency } from '../../utils/formatters.js';
import { formatReportQuantity, formatReportTimestamp } from '../../utils/reportDisplay.js';

const count = value => value.toLocaleString('vi-VN');
const money = value => value === null ? 'Chưa đủ giá vốn' : formatCurrency(value);

function DashboardMetric({ label, value, note }) {
    return <article className="panel report-card"><p>{label}</p><strong>{value}</strong><small>{note}</small></article>;
}

export function OwnerDashboard({ data, error, retry, businessType }) {
    if (!data) return <section className="panel owner-dashboard-state" aria-label="Báo cáo hôm nay">
        {error ? <><p role="alert">{error}</p><button className="button secondary" onClick={retry}>Thử lại</button></>
            : <><p role="status">Đang tải báo cáo hôm nay…</p><div className="dashboard-skeleton" aria-hidden="true">{[1, 2, 3, 4].map(key => <span key={key}/>)}</div></>}
    </section>;
    const { report, spoilage } = data;
    const { totals } = report;
    return <section className="owner-dashboard" aria-label="Báo cáo hôm nay">
        <div className="section-heading"><h2>Tình hình hôm nay</h2><button className="button secondary" onClick={retry}>Cập nhật số liệu</button><Link className="text-link" to="/revenue">Xem báo cáo</Link></div>
        <div className="report-cards">
            <DashboardMetric label="Doanh thu" value={formatCurrency(totals.revenue)} note="Bán trả ngay và mua chịu, trừ đơn hủy"/>
            <DashboardMetric label="Giá vốn" value={money(totals.cogs)} note="Giá vốn đã ghi nhận khi bán"/>
            <DashboardMetric label="Lợi nhuận gộp" value={money(totals.grossProfit)} note="Chưa trừ hao hụt và chi phí vận hành"/>
            <DashboardMetric label="Số đơn" value={`${count(totals.count)} đơn`} note="Đơn hôm nay còn hiệu lực"/>
            <DashboardMetric label="Hàng sắp hết" value={`${count(totals.lowStockCount)} mặt hàng`} note="Còn hàng nhưng đã chạm mức cảnh báo"/>
            <DashboardMetric label="Hàng đã hết" value={`${count(totals.outOfStockCount)} mặt hàng`} note="Mặt hàng đang kinh doanh có tồn bằng 0"/>
            {businessType === 'fruit_shop' && <>
                <DashboardMetric label="Trái cây hư/thối" value={spoilage.quantityByUnit.length
                    ? spoilage.quantityByUnit.map(row => formatReportQuantity(row.quantityBase, row.baseUnit)).join(' · ')
                    : 'Chưa ghi nhận'} note="Tách riêng từng đơn vị, tính trong hôm nay"/>
                <DashboardMetric label="Giá trị hư/thối" value={money(spoilage.value)} note={spoilage.costDataComplete
                    ? 'Giá vốn tại thời điểm ghi nhận hư/thối' : `${count(spoilage.unvaluedMovements)} lần chưa có giá vốn`}/>
            </>}
        </div>
        {!totals.costDataComplete && <p className="info-box">Có {count(totals.unvaluedSaleEvents)} sự kiện bán/hủy chưa đủ giá vốn. Giá vốn và lợi nhuận sẽ để trống để bạn không đọc nhầm.</p>}
        <div className="owner-dashboard-lists">
            <section className="panel"><div className="panel-heading"><h2>Hàng bán chạy hôm nay</h2></div>
                <div className="owner-dashboard-list">{report.topProducts.length ? report.topProducts.map(product =>
                    <div className="dashboard-list-row" key={product.id}><span><strong>{product.name}</strong><small>{formatReportQuantity(product.quantityBase, product.baseUnit)} đã bán</small></span><b>{formatCurrency(product.revenue)}</b></div>)
                    : <p className="panel-description">Chưa có đơn bán còn hiệu lực hôm nay.</p>}</div>
            </section>
            {businessType === 'grocery' && <section className="panel"><div className="panel-heading"><h2>Hàng tồn nhiều</h2></div>
                <div className="owner-dashboard-list"><p className="panel-description">Xếp riêng theo từng đơn vị gốc.</p>{data.highStockProducts.length ? data.highStockProducts.map(product =>
                    <div className="dashboard-list-row" key={product.id}><strong>{product.name}</strong><b>{formatReportQuantity(product.stock, product.baseUnit)}</b></div>)
                    : <p className="panel-description">Chưa có hàng tồn đang kinh doanh.</p>}</div>
            </section>}
            {businessType === 'grocery' && <section className="panel"><div className="panel-heading"><h2>Nhập hàng gần đây</h2><Link className="text-link" to="/history">Xem lịch sử</Link></div>
                <div className="owner-dashboard-list">{data.recentStockReceipts.length ? data.recentStockReceipts.map(receipt =>
                    <div className="dashboard-list-row" key={receipt.id}><span><strong>{receipt.supplierName || 'Phiếu nhập hàng'}</strong><small>{formatReportTimestamp(receipt.createdAt)} · {count(receipt.itemCount)} dòng hàng</small></span><b>{formatCurrency(receipt.totalCost)}</b></div>)
                    : <p className="panel-description">Chưa có phiếu nhập hàng.</p>}</div>
            </section>}
        </div>
    </section>;
}
