import { useAdminData } from '../hooks/useAdminData.js';
import { DataState, Heading, Metric } from '../components/AdminData.jsx';
import { adminDate as date, adminInteger as integer } from '../domain/display.js';
export { AdminShopsPage, AdminUsersPage, AdminAdminsPage, AdminSecurityPage, AdminAuditPage } from './AdminListPages.jsx';
import { useState } from 'react';
import { authService } from '../../services/authService.js';
import { accountSession } from '../../services/accountSession.js';
import { useAccountStore } from '../../stores/useAccountStore.js';
import { AdminSystemHealth, SystemHealthDetails } from '../components/AdminSystemHealth.jsx';


export function AdminDashboardPage() {
    const state = useAdminData('dashboard');
    return <><Heading title="Tổng quan nền tảng" text="Các số liệu được tính từ dữ liệu hiện có, không dùng số mẫu."/>
        <DataState state={state}>{data => <><div className="admin-metrics">
            <Metric label="Tổng cửa hàng" value={data.total_shops}/><Metric label="Đang hoạt động" value={data.active_shops}/>
            <Metric label="Tạm khóa" value={data.suspended_shops}/><Metric label="Tài khoản" value={data.total_users}/>
            <Metric label="Admin hoạt động" value={data.active_admins}/></div>
            <div className="admin-two-columns"><section className="admin-panel panel"><h2>7 ngày gần đây</h2>
                <p>Cửa hàng mới: <b>{integer(data.new_shops_7d)}</b></p><p>Tài khoản mới: <b>{integer(data.new_users_7d)}</b></p>
                <p>Tạp hóa: <b>{integer(data.grocery_shops)}</b> · Trái cây: <b>{integer(data.fruit_shops)}</b></p></section>
                <section className="admin-panel panel"><h2>Hoạt động Admin gần đây</h2>{data.recent_actions.length ? data.recent_actions.map(item =>
                    <p key={item.id}><b>{item.action}</b> · {date(item.created_at)}</p>) : <p>Chưa có thao tác.</p>}</section></div>
            <section className="admin-panel panel"><h2>Sự kiện bảo mật gần đây</h2>{data.recent_security_events.length ? data.recent_security_events.map(item =>
                <p key={item.id}>{item.event_type} · {date(item.created_at)}</p>) : <p>Chưa có sự kiện được hệ thống ghi nhận.</p>}</section>
        </>}</DataState><AdminSystemHealth/></>;
}

export { AdminShopDetailPage, AdminUserDetailPage } from './AdminDetailPages.jsx';

export function AdminSystemPage() {
    const state = useAdminData('system');
    return <><Heading title="Tình trạng hệ thống" text="Các chỉ số này phản ánh truy vấn đang chạy, không phải cam kết uptime."/>
        <DataState state={state}>{data => <><div className="admin-metrics"><Metric label="Cửa hàng" value={data.total_shops}/>
            <Metric label="Tài khoản" value={data.total_users}/><Metric label="Sản phẩm" value={data.total_products}/>
            <Metric label="Bản ghi bán hàng" value={data.total_sales_records}/></div>
            <SystemHealthDetails data={data}/></>}</DataState></>;
}

export function AdminSettingsPage() {
    const profile = useAccountStore(s => s.profile); const [busy, setBusy] = useState(false);
    return <><Heading title="Cài đặt quản trị" text="Thông tin phiên và bảo vệ tài khoản."/>
        <section className="admin-panel panel"><h2>Hồ sơ Admin</h2><p>{profile?.name || 'Quản trị viên'}</p>
            <p>Phiên quản trị yêu cầu MFA/AAL2. Nếu mất thiết bị xác thực, hãy xử lý qua quy trình khôi phục tin cậy.</p>
            <button className="button secondary" disabled={busy} onClick={async () => {
                setBusy(true); try { await authService.signOut(); accountSession.signedOut(); window.location.assign('/login'); }
                finally { setBusy(false); }
            }}>Đăng xuất</button></section></>;
}
