import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBasket, PackagePlus, BookOpen, Package, Wallet, Users, ArrowUpRight, Sun, CalendarDays, CircleAlert, Lightbulb, ChevronRight } from 'lucide-react';
import { useShopStore } from '../../stores/useShopStore';
import { ActivityList } from '../../components/ui';
import { summarizeRevenue } from '../../utils/revenue';
import { formatCurrency } from '../../utils/formatters';
const actions = [
    { to: '/sales', icon: ShoppingBasket, label: 'Bán hàng', text: 'Chọn hàng, tính tiền', color: 'green', number: '01' },
    { to: '/import', icon: PackagePlus, label: 'Nhập hàng', text: 'Thêm hàng vào tiệm', color: 'blue', number: '02' },
    { to: '/debt', icon: BookOpen, label: 'Sổ nợ', text: 'Ghi nợ, nhận tiền trả', color: 'orange', number: '03' },
    { to: '/inventory', icon: Package, label: 'Kho hàng', text: 'Xem hàng còn lại', color: 'purple', number: '04' },
];
export function HomePage() {
    const { products, customers, entries } = useShopStore();
    const received = summarizeRevenue(entries, 1).totals.received;
    const debt = customers.reduce((s, c) => s + c.totalDebt, 0);
    const lowStock = products.filter(p => p.isActive && p.stock <= 5);
    const date = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    return <div className="home-page">
    <div className="page-heading home-heading"><div><div className="eyebrow"><Sun size={18}/> MỘT NGÀY BUÔN BÁN THẬT VUI</div><h1>Chào bạn, hôm nay thế nào?</h1><p>Cùng chăm chút tiệm nhỏ của mình nhé.</p></div><div className="date-chip"><CalendarDays size={18}/>{date}</div></div>
    <section className="stats-grid" aria-label="Tình hình cửa hàng">
      <div className="stat-card revenue"><div className="stat-top"><span className="stat-icon"><Wallet size={24}/></span><span>Hôm nay đã thu</span><span className="stat-badge">Hôm nay</span></div><div className="stat-value">{formatCurrency(received)}</div><div className="stat-bottom"><span>Bán hàng + trả nợ − hoàn tiền</span><span className="mini-circle"><ArrowUpRight size={19}/></span></div></div><Link to="/debt" className="stat-card debt-stat"><div className="stat-top"><span className="stat-icon"><Users size={24}/></span><span>Khách đang nợ</span><ArrowUpRight size={21}/></div><div className="stat-value">{formatCurrency(debt)}</div><div className="stat-bottom"><span>{customers.filter(c => c.totalDebt > 0).length} khách còn tiền chưa trả</span><span className="text-link">Xem sổ nợ <ArrowRight size={16}/></span></div></Link></section>
    <section className="quick-section"><div className="section-heading">
      <h2>Bạn muốn làm gì?</h2><span>Chạm một lần, bắt đầu ngay</span>
      </div><div className="quick-grid">{actions.map(a => <Link className={`quick-card ${a.color}`} to={a.to} key={a.to}><div className="quick-top"><span className="quick-icon"><a.icon size={29} strokeWidth={1.7}/></span><ArrowUpRight className="quick-arrow" size={21}/></div><h3>{a.label}</h3><p>{a.text}</p></Link>)}</div></section>
    <div className="home-lower"><section className="panel recent-panel">
    <div className="panel-heading"><h2>Hoạt động gần đây</h2><Link className="text-link" to="/history">Xem tất cả <ArrowRight size={16}/></Link></div><ActivityList entries={entries.slice(0, 5)}/></section><div className="home-aside"><section className="panel low-stock-panel"><div className="panel-heading"><h2><CircleAlert size={20}/> Hàng cần nhập thêm</h2><span className="count-badge">{lowStock.length}</span></div><p className="panel-description">Để khách ghé là luôn có hàng.</p><div className="low-stock-list">{lowStock.length ? lowStock.slice(0, 3).map(p => <Link to={`/import/existing?product=${p.id}`} key={p.id}><span className="small-product"><Package size={21}/></span><span className="low-stock-name"><strong>{p.name}</strong><span className={p.stock === 0 ? 'text-red' : 'text-amber'}>{p.stock === 0 ? 'Đã hết hàng' : `Chỉ còn ${p.stock} ${p.unit}`}</span></span><ChevronRight size={17}/></Link>) : <p className="panel-description">Hàng trong kho vẫn còn đủ.</p>}</div><Link to="/inventory?filter=low" className="stock-link">Kiểm tra kho hàng <ArrowRight size={17}/></Link></section><div className="daily-tip"><Lightbulb size={24}/><div><strong>Mách nhỏ cho bạn</strong><p>Nhập hàng ngay khi hàng về để số lượng trong kho luôn chính xác nhé.</p></div></div></div></div>
    <div className="home-note"><span className="status-dot"/> Bạn đang xem dữ liệu mẫu. Cứ thoải mái dùng thử nhé!</div>
  </div>;
}
