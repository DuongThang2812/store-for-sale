import { NavLink, Outlet, Link } from 'react-router-dom';
import { Activity, Building2, ClipboardList, Gauge, Settings, Shield, Users, UserRoundCog, ShieldCheck, Store } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const items = [
    { to: '/admin', label: 'Tổng quan', icon: Gauge, end: true },
    { to: '/admin/shops', label: 'Cửa hàng', icon: Building2 },
    { to: '/admin/users', label: 'Tài khoản', icon: Users },
    { to: '/admin/admins', label: 'Quản trị viên', icon: UserRoundCog },
    { to: '/admin/security', label: 'Bảo mật', icon: Shield },
    { to: '/admin/audit-logs', label: 'Nhật ký Admin', icon: ClipboardList },
    { to: '/admin/system', label: 'Hệ thống', icon: Activity },
    { to: '/admin/settings', label: 'Cài đặt', icon: Settings },
];

export function AdminLayout() {
    useDocumentTitle();

    return (
        <div className="admin-shell">
            <a href="#admin-main" className="skip-link">Đến nội dung chính</a>
            <aside className="admin-sidebar">
                <div className="admin-brand">
                    <div className="admin-brand-icon">
                        <Shield size={22} />
                    </div>
                    <div>
                        BIN<span>ADMIN PORTAL</span>
                    </div>
                </div>
                <nav aria-label="Điều hướng quản trị">
                    {items.map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) => isActive ? 'admin-nav-item active' : 'admin-nav-item'}
                        >
                            <Icon size={20} />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="admin-sidebar-footer">
                    <Link to="/" className="admin-return-link">
                        <Store size={18} />
                        <span>Về cửa hàng</span>
                    </Link>
                    <p className="admin-sidebar-note">Cổng quản trị nền tảng</p>
                </div>
            </aside>
            <div className="admin-main-column">
                <header className="admin-topbar">
                    <div className="admin-topbar-title">
                        <strong>Quản trị nền tảng BIN</strong>
                    </div>
                    <div className="admin-topbar-right">
                        <span className="admin-mfa-badge">
                            <ShieldCheck size={16} />
                            <span>Bảo vệ bằng xác thực hai bước</span>
                        </span>
                    </div>
                </header>
                <main id="admin-main" className="admin-main">
                    <div className="route-content">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
