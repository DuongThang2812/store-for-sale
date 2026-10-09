import { Suspense, useLayoutEffect, useState } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBasket, PackagePlus, BookOpen, Package, Store, History, CircleHelp, ChevronRight, Leaf, Download, Upload, ChartColumnIncreasing, ShieldCheck, Calculator, Tag, Truck, Settings } from 'lucide-react';
import { Modal } from '../components/ui';
import { productCsvRows } from '../utils/stockCsv';
import { exportCsv } from '../utils/shopHelpers';
import { useAccountStore } from '../stores/useAccountStore';
import { canUseShopOperation } from '../domain/shopPermissions';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { preloadRoute } from '../routePages';
import { PageLoading, PageErrorBoundary } from '../components/PageLoading';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const navItems = [
    { to: '/', icon: Home, label: 'Trang chủ' },
    { to: '/calculator', icon: Calculator, label: 'Máy tính' },
    { to: '/sales', icon: ShoppingBasket, label: 'Bán hàng', permission: 'sell' },
    { to: '/import', icon: PackagePlus, label: 'Nhập hàng', permission: 'receiveStock' },
    { to: '/debt', icon: BookOpen, label: 'Sổ nợ', permission: 'manageDebt' },
    { to: '/inventory', icon: Package, label: 'Kho hàng' },
];

export function MainLayout() {
    useDocumentTitle();
    const [help, setHelp] = useState(false);
    const profile = useAccountStore(s => s.profile);
    const store = useAccountStore(s => s.store);
    const visibleNavItems = navItems.filter(item => !item.permission || canUseShopOperation(store, item.permission));
    const owner = store?.role === 'owner';
    const dataMode = useAccountStore(s => s.dataMode);
    const shopKind = store?.businessType === 'fruit_shop' ? 'Trái cây' : 'Tạp hóa';
    const location = useLocation();
    const products = useActiveShopStore(s => s.products);
    const customers = useActiveShopStore(s => s.customers);

    useLayoutEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, [location.pathname]);

    const current = [...navItems, { to: '/categories', label: 'Danh mục hàng' }, { to: '/suppliers', label: 'Nhà cung cấp' }, { to: '/revenue', label: 'Biểu đồ & doanh thu' }, { to: '/settings', label: 'Cài đặt cửa hàng' }, { to: '/account', label: 'Tài khoản & sao lưu' }].find(n => n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to));
    const dbPage = dataMode === 'supabase' || ['/import/catalog', '/categories', '/suppliers'].includes(location.pathname);

    return (
        <div className="app-shell" onPointerOver={preloadRoute} onFocus={preloadRoute}>
            <a href="#main-content" className="skip-link">Đến nội dung chính</a>
            <aside className="sidebar">
                <Link to="/" className="brand">
                    <span className="brand-icon"><Store size={28}/></span>
                    <span>{shopKind}<strong>BIN<span className="brand-period">.</span></strong></span>
                </Link>
                <div className="store-label">
                    <span className="status-dot"/>
                    <span>{store?.name || 'Cửa hàng của bạn'}</span>
                </div>
                <p className="nav-caption">VIỆC HẰNG NGÀY</p>
                <nav className="main-nav" aria-label="Điều hướng chính">
                    {visibleNavItems.map(n => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.to === '/'}
                            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}
                        >
                            <n.icon size={21}/>
                            <span>{n.label}</span>
                            <ChevronRight className="nav-chevron" size={17}/>
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-secondary">
                    <NavLink to="/history" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <History size={20}/> Lịch sử hoạt động
                    </NavLink>
                    <NavLink to="/categories" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Tag size={20}/> Danh mục hàng
                    </NavLink>
                    <NavLink to="/suppliers" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Truck size={20}/> Nhà cung cấp
                    </NavLink>
                    <button className="nav-item" type="button" onClick={() => { exportCsv('hang-hoa.csv', productCsvRows(products)); }}>
                        <Download size={20}/> Tải danh sách hàng
                    </button>
                    {owner && (
                        <NavLink to="/import/csv" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                            <Upload size={20}/> Nhập hàng từ CSV
                        </NavLink>
                    )}
                    {owner && (
                        <NavLink to="/import/catalog" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                            <Upload size={20}/> Nhập danh mục Excel
                        </NavLink>
                    )}
                    {owner && (
                        <NavLink to="/revenue" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                            <ChartColumnIncreasing size={20}/> Biểu đồ & doanh thu
                        </NavLink>
                    )}
                    {owner && (
                        <NavLink to="/settings" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                            <Settings size={20}/> Cài đặt cửa hàng
                        </NavLink>
                    )}
                    <NavLink to="/account" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                        <ShieldCheck size={20}/> Tài khoản & sao lưu
                    </NavLink>
                </div>
                <div className="sidebar-bottom">
                    <div className="help-card">
                        <span className="help-icon"><CircleHelp size={22}/></span>
                        <strong>Mới dùng lần đầu?</strong>
                        <p>Mình hướng dẫn bạn nhé.</p>
                        <button type="button" onClick={() => setHelp(true)}>
                            Xem cách sử dụng <ChevronRight size={15}/>
                        </button>
                    </div>
                    <div className="sidebar-signoff">
                        <Leaf size={15}/> Nhẹ việc tiệm, vui mỗi ngày
                    </div>
                </div>
            </aside>

            <div className="main-shell">
                <header className="topbar">
                    <div className="breadcrumb">
                        <Store size={18}/>
                        <span>BIN</span>
                        <ChevronRight size={14}/>
                        <strong>{current?.label || 'Cửa hàng'}</strong>
                    </div>
                    <Link to="/" className="mobile-brand">
                        <Store size={22}/> BIN<span>.</span>
                    </Link>
                    <div className="topbar-right">
                        <span className="demo-tag">
                            <span className="status-dot"/> {dbPage ? 'Dữ liệu DB' : 'Giao dịch trên máy'}
                        </span>
                        <Link className="avatar" aria-label="Tài khoản và sao lưu" to="/account">
                            {profile?.name?.slice(0, 2).toUpperCase() || "NM"}
                        </Link>
                    </div>
                </header>

                <div className="mobile-tools">
                    {owner && <Link to="/import/csv"><Upload size={16}/> Nhập CSV</Link>}
                    {owner && <Link to="/import/catalog"><Upload size={16}/> Nhập Excel</Link>}
                    {owner && <Link to="/revenue"><ChartColumnIncreasing size={16}/> Doanh thu</Link>}
                    <Link to="/history"><History size={16}/> Lịch sử</Link>
                    {owner && <Link to="/settings"><Settings size={16}/> Cài đặt</Link>}
                    <Link to="/account"><ShieldCheck size={16}/> Sao lưu</Link>
                </div>

                <main id="main-content" className="main-content">
                    <PageErrorBoundary key={location.pathname}>
                        <Suspense fallback={<PageLoading/>}>
                            <div className="route-content">
                                <Outlet />
                            </div>
                        </Suspense>
                    </PageErrorBoundary>
                </main>

                <footer className="page-footer">
                    <span><Store size={15}/> {shopKind} BIN</span>
                    <span>Dễ dùng mỗi ngày. An tâm buôn bán.</span>
                </footer>
            </div>

            <nav className="bottom-nav" aria-label="Điều hướng điện thoại">
                {visibleNavItems.map(n => (
                    <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => isActive ? 'active' : ''}>
                        <n.icon size={22}/>
                        <span>{n.label}</span>
                    </NavLink>
                ))}
            </nav>

            {help && (
                <Modal title="Cùng làm quen với BIN" onClose={() => setHelp(false)}>
                    <div className="help-steps">
                        <p><b>1. Bán hàng:</b> chọn món → xem giỏ → nhận tiền hoặc ghi nợ.</p>
                        <p><b>2. Nhập hàng:</b> chọn hàng đã có để cộng thêm, hoặc thêm một mặt hàng mới.</p>
                        <p><b>3. Sổ nợ:</b> thêm khách → chọn hàng → tính tiền mua chịu. Trả hết thì khách được xóa khỏi sổ; trả một phần thì giữ lại.</p>
                        <p><b>4. Kho hàng:</b> xem hàng còn lại, sửa giá và tìm hàng sắp hết.</p>
                    </div>
                    <div className="info-box">
                        {dataMode === 'supabase'
                            ? 'Giao dịch cửa hàng lưu trong Supabase DB. Báo cáo và tồn kho được đọc lại từ hệ thống sau mỗi thao tác.'
                            : 'Giao dịch hiện lưu trên trình duyệt; vào “Tài khoản & sao lưu” để tải bản đầy đủ hoặc khôi phục.'}
                    </div>
                    <button
                        className="button secondary full"
                        type="button"
                        onClick={() => exportCsv('so-no.csv', [['Tên khách', 'Điện thoại', 'Còn nợ'], ...customers.map(c => [c.name, c.phone || '', c.totalDebt])])}
                    >
                        <Download size={18}/> Tải danh sách công nợ
                    </button>
                    <button className="button primary full" type="button" onClick={() => setHelp(false)}>
                        Đã hiểu, bắt đầu thôi
                    </button>
                </Modal>
            )}
        </div>
    );
}
