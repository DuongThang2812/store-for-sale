import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/ui.jsx';
import { adminApi } from '../services/adminApi.js';
import { useAdminData } from '../hooks/useAdminData.js';
import { useAdminListFilters } from '../hooks/useAdminListFilters.js';
import { ActionDialog } from '../components/AdminActionDialog.jsx';
import { AdminTable, AdminFilterBar, DataState, Heading, Pager, Metric, StatusBadge } from '../components/AdminData.jsx';
import { adminDate as date, adminInteger as integer, businessLabel } from '../domain/display.js';

const limit = 20;
function ListPage({ resource, title, text, columns, emptyText }) {
    const filters = useAdminListFilters();
    const state = useAdminData(resource, { ...filters.options, offset: filters.offset, limit });
    return <><Heading title={title} text={text}/><AdminFilterBar resource={resource} filters={filters} onReload={state.reload}/>
        <DataState state={state}>{data => <><AdminTable rows={data.items} columns={columns} emptyText={emptyText}/>
            <Pager offset={filters.offset} limit={limit} total={data.total} onChange={filters.setOffset}/></>}</DataState></>;
}
const shopColumns = [
    { key: 'name', label: 'Cửa hàng', render: row => <Link to={`/admin/shops/${row.id}`}>{row.name}</Link> },
    { key: 'business_type', label: 'Loại', render: row => businessLabel(row.business_type) },
    { key: 'owner_name', label: 'Chủ', render: row => <>{row.owner_name || 'Chưa rõ'}<br/><small>{row.owner_email || ''}</small></> },
    { key: 'member_count', label: 'Thành viên', render: row => integer(row.member_count) },
    { key: 'product_count', label: 'Hàng hóa', render: row => integer(row.product_count) },
    { key: 'status', label: 'Trạng thái', render: row => <StatusBadge value={row.status}/> },
    { key: 'created_at', label: 'Ngày tạo', render: row => date(row.created_at) },
    { key: 'last_activity_at', label: 'Hoạt động', render: row => date(row.last_activity_at) },
    { key: 'actions', label: 'Thao tác', render: row => <Link to={`/admin/shops/${row.id}`}>Chi tiết</Link> },
];
export function AdminShopsPage() {
    return <ListPage resource="shops" title="Cửa hàng" text="Tìm và quản lý trạng thái, không xem đơn hàng hay thông tin khách mặc định." columns={shopColumns}/>;
}
const userColumns = [
    { key: 'display_name', label: 'Tên', render: row => <Link to={`/admin/users/${row.id}`}>{row.display_name}</Link> },
    { key: 'email', label: 'Email' },
    { key: 'shop_count', label: 'Cửa hàng', render: row => integer(row.shop_count) },
    { key: 'roles', label: 'Vai trò', render: row => row.roles.join(', ') || '—' },
    { key: 'account_status', label: 'Trạng thái', render: row => <StatusBadge value={row.account_status}/> },
    { key: 'created_at', label: 'Ngày tạo', render: row => date(row.created_at) },
    { key: 'actions', label: 'Thao tác', render: row => <Link to={`/admin/users/${row.id}`}>Chi tiết</Link> },
];
export function AdminUsersPage() {
    return <ListPage resource="users" title="Tài khoản" text="Tra cứu người dùng và trạng thái truy cập." columns={userColumns}/>;
}
export function AdminAdminsPage() {
    const filters = useAdminListFilters();
    const state = useAdminData('admins', { ...filters.options, offset: filters.offset, limit });
    const [targetId, setTargetId] = useState('');
    const [action, setAction] = useState(null);
    const columns = [
        { key: 'display_name', label: 'Tên', render: row => <>{row.display_name}<br/><small>{row.user_id}</small></> },
        { key: 'email', label: 'Email' }, { key: 'admin_role', label: 'Vai trò' },
        { key: 'is_active', label: 'Trạng thái', render: row => <StatusBadge value={row.is_active ? 'active' : 'disabled'}/> },
        { key: 'created_at', label: 'Ngày cấp', render: row => date(row.created_at) },
        { key: 'actions', label: 'Thao tác', render: row => <button className="button secondary" onClick={() => setAction({ id: row.user_id, enable: !row.is_active, name: row.display_name })}>{row.is_active ? 'Vô hiệu' : 'Kích hoạt'}</button> },
    ];
    return <><Heading title="Quản trị viên" text="Chỉ cấp quyền cho tài khoản đã tồn tại. Admin cuối cùng được bảo vệ."/>
        <section className="admin-panel panel"><h2>Cấp quyền Admin</h2><label className="field">UUID tài khoản có sẵn<input value={targetId} onChange={event => setTargetId(event.target.value)} placeholder="UUID từ trang Tài khoản"/></label>
            <button className="button primary" disabled={!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId.trim())} onClick={() => setAction({ id: targetId.trim(), enable: true, name: targetId.trim() })}>Cấp quyền</button></section>
        <AdminFilterBar resource="admins" filters={filters} onReload={state.reload}/>
        <DataState state={state}>{data => <><AdminTable rows={data.items} columns={columns}/><Pager offset={filters.offset} limit={limit} total={data.total} onChange={filters.setOffset}/></>}</DataState>
        {action && <ActionDialog title={action.enable ? 'Cấp / kích hoạt Admin' : 'Vô hiệu Admin'}
            intent={{ action: 'admin_status', targetId: action.id, enable: action.enable }}
            confirmWord={action.enable ? 'GRANT' : 'REVOKE'} warning={`Thay đổi quyền quản trị của ${action.name}. Thao tác này được ghi vào nhật ký.`}
            onClose={() => setAction(null)} onConfirm={async (reason, requestId) => {
                await adminApi.act('admin_status', { targetId: action.id, enable: action.enable, reason, requestId }); state.reload();
            }}/>}</>;
}
export function AdminSecurityPage() {
    const summary = useAdminData('dashboard');
    const filters = useAdminListFilters();
    const events = useAdminData('security', { ...filters.options, offset: filters.offset, limit });
    const columns = [
        { key: 'created_at', label: 'Thời gian', render: row => date(row.created_at) },
        { key: 'event_type', label: 'Sự kiện' },
        { key: 'user_id', label: 'Người dùng', render: row => row.user_id ? <Link to={`/admin/users/${row.user_id}`}>{row.user_name || row.user_id}</Link> : '—' },
        { key: 'metadata', label: 'Thông tin ghi nhận', render: row => <code>{JSON.stringify(row.metadata)}</code> },
    ];
    return <><Heading title="Bảo mật" text="Chỉ hiển thị sự kiện hệ thống thực sự ghi nhận."/>
        <DataState state={summary}>{data => <div className="admin-metrics"><Metric label="Shop tạm khóa" value={data.suspended_shops}/>
            <Metric label="User vô hiệu" value={data.disabled_users}/><Metric label="Admin hoạt động" value={data.active_admins}/>
            <Metric label="Thao tác Admin hôm nay" value={data.admin_actions_today}/></div>}</DataState>
        <AdminFilterBar resource="security" filters={filters} onReload={() => { events.reload(); summary.reload(); }}/>
        <DataState state={events}>{data => <><AdminTable rows={data.items} columns={columns} emptyText="Chưa có sự kiện phù hợp được hệ thống ghi nhận."/>
            <Pager offset={filters.offset} limit={limit} total={data.total} onChange={filters.setOffset}/></>}</DataState></>;
}
export function AdminAuditPage() {
    const filters = useAdminListFilters();
    const state = useAdminData('audit', { ...filters.options, offset: filters.offset, limit });
    const [inspecting, setInspecting] = useState(null);
    const columns = [
        { key: 'created_at', label: 'Thời gian', render: row => date(row.created_at) },
        { key: 'admin_user_id', label: 'Admin', render: row => <Link to={`/admin/users/${row.admin_user_id}`}>{row.admin_name || row.admin_user_id}</Link> },
        { key: 'action', label: 'Hành động' },
        { key: 'target_id', label: 'Đối tượng', render: row => <>{row.target_type}<br/><small>{row.target_id}</small></> },
        { key: 'reason', label: 'Lý do' },
        { key: 'details', label: 'Chi tiết', render: row => <button className="button secondary" onClick={() => setInspecting(row)}>Xem chi tiết</button> },
    ];
    return <><Heading title="Nhật ký quản trị" text="Mọi thay đổi nhạy cảm được lưu cùng transaction tại database."/>
        <AdminFilterBar resource="audit" filters={filters} onReload={state.reload}/>
        <DataState state={state}>{data => <><AdminTable rows={data.items} columns={columns}/><Pager offset={filters.offset} limit={limit} total={data.total} onChange={filters.setOffset}/></>}</DataState>
        {inspecting && <Modal title={`Chi tiết nhật ký: ${inspecting.action}`} onClose={() => setInspecting(null)}>
            <dl className="admin-detail-grid"><div><dt>Thời gian</dt><dd>{date(inspecting.created_at)}</dd></div>
                <div><dt>Admin</dt><dd>{inspecting.admin_name || inspecting.admin_user_id}</dd></div>
                <div><dt>Đối tượng</dt><dd>{inspecting.target_type} ({inspecting.target_id})</dd></div>
                <div><dt>Lý do</dt><dd>{inspecting.reason || 'Không ghi chú'}</dd></div></dl>
            <div className="admin-audit-json"><section><h3>Dữ liệu trước</h3><pre>{JSON.stringify(inspecting.before_data, null, 2) || '—'}</pre></section>
                <section><h3>Dữ liệu sau</h3><pre>{JSON.stringify(inspecting.after_data, null, 2) || '—'}</pre></section></div>
            <button className="button secondary full" onClick={() => setInspecting(null)}>Đóng</button>
        </Modal>}</>;
}
