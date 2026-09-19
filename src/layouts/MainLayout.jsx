import { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBasket, PackagePlus, BookOpen, Package, Store, History, CircleHelp, ChevronRight, Leaf, Download, Upload, ChartColumnIncreasing, ShieldCheck, Calculator } from 'lucide-react';
import { Modal } from '../components/ui';
import { productCsvRows } from '../utils/stockCsv';
import { exportCsv } from '../utils/shopHelpers';
import { useAccountStore } from '../stores/useAccountStore';
import { useShopStore } from '../stores/useShopStore';
const navItems = [
    { to: '/', icon: Home, label: 'Trang chủ' },
    { to: '/calculator', icon: Calculator, label: 'Máy tính' },
    { to: '/sales', icon: ShoppingBasket, label: 'Bán hàng' },
    { to: '/import', icon: PackagePlus, label: 'Nhập hàng' },
    { to: '/debt', icon: BookOpen, label: 'Sổ nợ' },
    { to: '/inventory', icon: Package, label: 'Kho hàng' },
];
export function MainLayout() {
    const [help, setHelp] = useState(false);
    const profile = useAccountStore(s => s.profile);
    const location = useLocation();
    const products = useShopStore(s => s.products);
    const customers = useShopStore(s => s.customers);
    useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
    const current = [...navItems, { to: '/revenue', label: 'Biểu đồ & doanh thu' }, { to: '/account', label: 'Tài khoản & sao lưu' }].find(n => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to));
    return <div className="app-shell">
    <a href="#main-content" className="skip-link">Đến nội dung chính</a>
    <aside className="sidebar">
      <Link to="/" className="brand"><span className="brand-icon"><Store size={29}/></span><span>Tạp hóa<strong>BIN<span className="brand-period">.</span></strong></span></Link>
      <div className="store-label"><span className="status-dot"/> Cửa hàng của bạn</div>
      <p className="nav-caption">VIỆC HẰNG NGÀY</p>
      <nav className="main-nav" aria-label="Điều hướng chính">{navItems.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><n.icon size={22}/><span>{n.label}</span><ChevronRight className="nav-chevron" size={17}/></NavLink>)}</nav>
      <div className="sidebar-secondary"><NavLink to="/history" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><History size={21}/> Lịch sử hoạt động</NavLink><button className="nav-item" onClick={() => { exportCsv('hang-hoa.csv', productCsvRows(products)); }}><Download size={21}/> Tải danh sách hàng</button><NavLink to="/import/csv" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}><Upload size={21}/> Nhập hàng từ CSV</NavLink><NavLink to="/revenue" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}><ChartColumnIncreasing size={21}/> Biểu đồ & doanh thu</NavLink><NavLink to="/account" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}><ShieldCheck size={21}/> Tài khoản & sao lưu</NavLink></div>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={25}/></span><strong>Mới dùng lần đầu?</strong><p>Mình hướng dẫn bạn nhé.</p><button onClick={() => setHelp(true)}>Xem cách sử dụng <ChevronRight size={16}/></button></div><div className="sidebar-signoff"><Leaf size={16}/> Nhẹ việc tiệm, vui mỗi ngày</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><Store size={19}/><span>Nhà Mình</span><ChevronRight size={14}/><strong>{current?.label || 'Lịch sử hoạt động'}</strong></div><Link to="/" className="mobile-brand"><Store size={24}/> Nhà Mình<span>.</span></Link><div className="topbar-right"><span className="demo-tag"><span className="status-dot"/> Bản dùng thử</span><Link className="avatar" aria-label="Tài khoản và sao lưu" to="/account">{profile?.name?.slice(0, 2).toUpperCase() || "NM"}</Link></div></header>
      <div className="mobile-tools"><Link to="/import/csv"><Upload size={17}/> Nhập CSV</Link><Link to="/revenue"><ChartColumnIncreasing size={17}/> Doanh thu</Link><Link to="/history"><History size={17}/> Lịch sử</Link><Link to="/account"><ShieldCheck size={17}/> Sao lưu</Link></div><main id="main-content" className="main-content"><Outlet /></main>
      <footer className="page-footer"><span><Store size={15}/> Tạp hóa Nhà Mình</span><span>Dễ dùng mỗi ngày. An tâm buôn bán.</span></footer>
    </div>
    <nav className="bottom-nav" aria-label="Điều hướng điện thoại">{navItems.map(n => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}><n.icon size={23}/><span>{n.label}</span></NavLink>)}</nav>
    {help && <Modal title="Cùng làm quen với BIN" onClose={() => setHelp(false)}><div className="help-steps"><p><b>1. Bán hàng:</b> chọn món → xem giỏ → nhận tiền hoặc ghi nợ.</p><p><b>2. Nhập hàng:</b> chọn hàng đã có để cộng thêm, hoặc thêm một mặt hàng mới.</p><p><b>3. Sổ nợ:</b> thêm khách → chọn hàng → tính tiền mua chịu. Trả hết thì khách được xóa khỏi sổ; trả một phần thì giữ lại.</p><p><b>4. Kho hàng:</b> xem hàng còn lại, sửa giá và tìm hàng sắp hết.</p></div><div className="info-box">Đây là bản giao diện thử, dữ liệu chỉ lưu trên trình duyệt. Vào “Tài khoản & sao lưu” để tải bản đầy đủ hoặc khôi phục; vào “Lịch sử hoạt động” để hủy đơn bán nhầm.</div><button className="button secondary full" onClick={() => exportCsv('so-no.csv', [['Tên khách', 'Điện thoại', 'Còn nợ'], ...customers.map(c => [c.name, c.phone || '', c.totalDebt])])}><Download size={19}/> Tải danh sách công nợ</button><button className="button primary full" onClick={() => setHelp(false)}>Đã hiểu, bắt đầu thôi</button></Modal>}
  </div>;
}
