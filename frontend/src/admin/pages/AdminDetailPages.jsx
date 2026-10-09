import { useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminData } from '../hooks/useAdminData.js';
import { ActionDialog } from '../components/AdminActionDialog.jsx';
import { AdminTable, DataState, Heading, Pager, StatusBadge } from '../components/AdminData.jsx';
import { adminDate as date, adminInteger as integer, businessLabel } from '../domain/display.js';
import { adminApi } from '../services/adminApi.js';

const shopTabs = [{ key: 'overview', label: 'Tổng quan' }, { key: 'members', label: 'Thành viên' },
    { key: 'activity', label: 'Hoạt động nền tảng' }, { key: 'security', label: 'Bảo mật' }];
const roleLabel = role => role === 'owner' ? 'Chủ tiệm' : 'Nhân viên';
function permissions(row) {
    if (row.role === 'owner') return 'Quyền chủ tiệm';
    return [row.can_sell && 'Bán hàng', row.can_receive_stock && 'Nhập kho', row.can_manage_debt && 'Công nợ'].filter(Boolean).join(', ') || 'Chỉ xem';
}
const activityColumns = [
    { key: 'created_at', label: 'Thời gian', render: row => date(row.created_at) },
    { key: 'admin_name', label: 'Admin', render: row => <Link to={`/admin/users/${row.admin_user_id}`}>{row.admin_name || row.admin_user_id}</Link> },
    { key: 'action', label: 'Hành động' }, { key: 'reason', label: 'Lý do' },
];
const securityColumns = [
    { key: 'created_at', label: 'Thời gian', render: row => date(row.created_at) },
    { key: 'event_type', label: 'Sự kiện' },
    { key: 'user_name', label: 'Người dùng', render: row => row.user_id ? <Link to={`/admin/users/${row.user_id}`}>{row.user_name || row.user_id}</Link> : '—' },
    { key: 'metadata', label: 'Thông tin ghi nhận', render: row => <code>{JSON.stringify(row.metadata)}</code> },
];
const memberColumns = [
    { key: 'display_name', label: 'Tên', render: row => <Link to={`/admin/users/${row.user_id}`}>{row.display_name}</Link> },
    { key: 'email', label: 'Email' }, { key: 'role', label: 'Vai trò', render: row => roleLabel(row.role) },
    { key: 'is_active', label: 'Thành viên', render: row => row.is_active ? 'Đang tham gia' : 'Đã vô hiệu' },
    { key: 'account_status', label: 'Tài khoản', render: row => <StatusBadge value={row.account_status}/> },
    { key: 'permissions', label: 'Quyền nghiệp vụ', render: permissions },
];
const membershipColumns = [
    { key: 'store_name', label: 'Cửa hàng', render: row => <Link to={`/admin/shops/${row.store_id}`}>{row.store_name}</Link> },
    { key: 'business_type', label: 'Loại', render: row => businessLabel(row.business_type) },
    { key: 'store_status', label: 'Cửa hàng', render: row => <StatusBadge value={row.store_status}/> },
    { key: 'role', label: 'Vai trò', render: row => roleLabel(row.role) },
    { key: 'is_active', label: 'Thành viên', render: row => row.is_active ? 'Đang tham gia' : 'Đã vô hiệu' },
    { key: 'permissions', label: 'Quyền nghiệp vụ', render: permissions },
];

function RelatedList({ resource, targetId, columns, title, emptyText }) {
    const [offset, setOffset] = useState(0);
    const limit = 20;
    const state = useAdminData(resource, { targetId, offset, limit });
    return <section className="admin-related-list"><div className="admin-inline-actions"><h2>{title}</h2>
        <button className="button secondary" onClick={state.reload}>Tải lại</button></div>
        <DataState state={state}>{data => <><AdminTable rows={data.items} columns={columns} emptyText={emptyText}/>
            <Pager offset={offset} limit={limit} total={data.total} onChange={setOffset}/></>}</DataState></section>;
}
function DetailTabs({ selected, onChange, id }) {
    return <div className="admin-detail-tabs" role="tablist" aria-label="Chi tiết cửa hàng" onKeyDown={event => {
        const index = shopTabs.findIndex(tab => tab.key === selected);
        const next = { ArrowRight: (index + 1) % shopTabs.length, ArrowLeft: (index + shopTabs.length - 1) % shopTabs.length,
            Home: 0, End: shopTabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault(); onChange(shopTabs[next].key);
        event.currentTarget.querySelectorAll('[role="tab"]')[next].focus();
    }}>{shopTabs.map(tab => <button key={tab.key} type="button" role="tab" id={`${id}-${tab.key}`}
        aria-selected={selected === tab.key} aria-controls={`${id}-panel`} tabIndex={selected === tab.key ? 0 : -1}
        onClick={() => onChange(tab.key)}>{tab.label}</button>)}</div>;
}
const shopActions = { suspended: { title: 'Tạm khóa cửa hàng', word: 'SUSPEND' },
    active: { title: 'Mở lại cửa hàng', word: 'RESTORE' }, archived: { title: 'Lưu trữ cửa hàng', word: 'ARCHIVE' } };
function ShopDetail({ targetId }) {
    const state = useAdminData('shop', { targetId });
    const [selected, setSelected] = useState('overview');
    const [action, setAction] = useState(null);
    const tabId = useId();
    return <><Heading title="Chi tiết cửa hàng" text="Thông tin quản trị và sự kiện được hệ thống ghi nhận." back="/admin/shops"/>
        <DataState state={state}>{shop => <><section className="admin-panel panel"><h2>{shop.name}</h2>
            <p>{businessLabel(shop.business_type)} · <StatusBadge value={shop.status}/></p>
            <div className="admin-inline-actions">{shop.status === 'active' && <button className="button danger" onClick={() => setAction('suspended')}>Tạm khóa</button>}
                {shop.status === 'suspended' && <button className="button primary" onClick={() => setAction('active')}>Mở lại</button>}
                {shop.status !== 'archived' && <button className="button secondary" onClick={() => setAction('archived')}>Lưu trữ</button>}
                <button className="button secondary" onClick={state.reload}>Tải lại</button></div></section>
            <DetailTabs selected={selected} onChange={setSelected} id={tabId}/>
            <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${selected}`} tabIndex={0}>
                {selected === 'overview' && <section className="admin-panel panel"><h2>Tổng quan</h2><dl className="admin-detail-grid">
                    <div><dt>Chủ</dt><dd><Link to={`/admin/users/${shop.owner_id}`}>{shop.owner_name || 'Chưa rõ'}</Link><br/>{shop.owner_email || ''}</dd></div>
                    <div><dt>Thành viên hoạt động</dt><dd>{integer(shop.member_count)}</dd></div>
                    <div><dt>Mặt hàng</dt><dd>{integer(shop.product_count)}</dd></div>
                    <div><dt>Tạo lúc</dt><dd>{date(shop.created_at)}</dd></div>
                    <div><dt>Hoạt động gần nhất</dt><dd>{date(shop.last_activity_at)}</dd></div>
                    <div><dt>Mã cửa hàng</dt><dd>{shop.id}</dd></div></dl></section>}
                {selected === 'members' && <RelatedList key="members" resource="shop_members" targetId={targetId} columns={memberColumns} title="Thành viên" emptyText="Chưa có thành viên."/>}
                {selected === 'activity' && <RelatedList key="activity" resource="shop_activity" targetId={targetId} columns={activityColumns} title="Hoạt động nền tảng" emptyText="Chưa có thao tác quản trị với cửa hàng này."/>}
                {selected === 'security' && <RelatedList key="security" resource="shop_security" targetId={targetId} columns={securityColumns} title="Sự kiện bảo mật" emptyText="Chưa có sự kiện liên quan được hệ thống ghi nhận."/>}
            </div>
            {action && <ActionDialog title={shopActions[action].title} confirmWord={shopActions[action].word}
                intent={{ action: 'store_status', targetId, status: action }}
                warning={`Cửa hàng ${shop.name} sẽ chuyển trạng thái. Bán hàng, nhập kho, công nợ và sửa hàng bị chặn tại database khi cửa hàng tạm khóa hoặc lưu trữ.`}
                onClose={() => setAction(null)} onConfirm={async (reason, requestId) => {
                    await adminApi.act('store_status', { targetId, status: action, reason, requestId }); state.reload();
                }}/>}</>}</DataState></>;
}
function UserDetail({ targetId }) {
    const state = useAdminData('user', { targetId });
    const [action, setAction] = useState(null);
    return <><Heading title="Chi tiết tài khoản" text="Thông tin truy cập và sự kiện quản trị liên quan." back="/admin/users"/>
        <DataState state={state}>{user => <><section className="admin-panel panel"><h2>{user.display_name}</h2>
            <dl className="admin-detail-grid"><div><dt>Email</dt><dd>{user.email || '—'}</dd></div>
                <div><dt>Trạng thái</dt><dd><StatusBadge value={user.account_status}/></dd></div>
                <div><dt>Ngày tạo</dt><dd>{date(user.created_at)}</dd></div><div><dt>Mã tài khoản</dt><dd>{user.id}</dd></div></dl>
            <div className="admin-inline-actions"><button className={user.account_status === 'active' ? 'button danger' : 'button primary'}
                onClick={() => setAction(user.account_status === 'active' ? 'disabled' : 'active')}>
                {user.account_status === 'active' ? 'Vô hiệu tài khoản' : 'Kích hoạt lại'}</button>
                <button className="button secondary" onClick={() => setAction('password_reset')}>Gửi email đặt lại mật khẩu</button>
                <button className="button secondary" onClick={state.reload}>Tải lại</button></div></section>
            <section className="admin-panel panel"><h2>Thông tin xác thực</h2>{user.authentication_summary?.available
                ? <dl className="admin-detail-grid"><div><dt>Email xác nhận</dt><dd>{user.authentication_summary.email_confirmed_at ? date(user.authentication_summary.email_confirmed_at) : 'Chưa xác nhận'}</dd></div>
                    <div><dt>Đăng nhập gần nhất</dt><dd>{date(user.authentication_summary.last_sign_in_at)}</dd></div></dl>
                : <p>Chưa lấy được thông tin xác thực. Nhấn Tải lại để kiểm tra.</p>}</section>
            <RelatedList resource="user_memberships" targetId={targetId} columns={membershipColumns} title="Cửa hàng tham gia" emptyText="Chưa tham gia cửa hàng."/>
            <RelatedList resource="user_security" targetId={targetId} columns={securityColumns} title="Sự kiện bảo mật" emptyText="Chưa có sự kiện được hệ thống ghi nhận."/>
            <RelatedList resource="user_activity" targetId={targetId} columns={activityColumns} title="Thao tác Admin liên quan" emptyText="Chưa có thao tác quản trị với tài khoản này."/>
            {action && <ActionDialog title={action === 'disabled' ? 'Vô hiệu tài khoản' : action === 'active' ? 'Kích hoạt tài khoản' : 'Gửi email đặt lại mật khẩu'}
                intent={{ action: action === 'password_reset' ? 'password_reset' : 'user_status', targetId, status: action }}
                confirmWord={action === 'disabled' ? 'DISABLE' : action === 'active' ? 'ENABLE' : 'RESET'}
                warning={action === 'password_reset' ? `Gửi hướng dẫn đặt lại mật khẩu tới email của ${user.display_name}.` : `Thay đổi quyền truy cập của ${user.display_name}. Thao tác được ghi vào nhật ký quản trị.`}
                onClose={() => setAction(null)} onConfirm={async (reason, requestId) => {
                    await adminApi.act(action === 'password_reset' ? 'password_reset' : 'user_status',
                        { targetId, ...(action === 'password_reset' ? {} : { status: action }), reason, requestId }); state.reload();
                }}/>}</>}</DataState></>;
}
// Parameter changes remount local dialog/tab/page state, so an old confirmation
// cannot accidentally target the next account/shop after client navigation.
export function AdminShopDetailPage() { const { id } = useParams(); return <ShopDetail key={id} targetId={id}/>; }
export function AdminUserDetailPage() { const { id } = useParams(); return <UserDetail key={id} targetId={id}/>; }
