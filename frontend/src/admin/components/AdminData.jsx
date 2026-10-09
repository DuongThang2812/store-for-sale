import { Link } from 'react-router-dom';
import { adminActions, adminSecurityEvents } from '../domain/listFilters.js';
import { adminInteger, statusLabel } from '../domain/display.js';

export function DataState({ state, children }) {
    if (state.loading) return <div className="admin-panel" role="status">Đang tải dữ liệu thật từ hệ thống…</div>;
    if (state.error) return <div className="admin-panel"><p className="error" role="alert">{state.error}</p><button className="button secondary" onClick={state.reload}>Thử lại</button></div>;
    return children(state.data);
}
export function Heading({ title, text, back }) {
    return <div className="admin-heading">{back && <Link to={back} className="text-link">← Quay lại</Link>}<h1>{title}</h1><p>{text}</p></div>;
}
export function Pager({ offset, limit, total, onChange }) {
    if (!total && !offset) return null;
    return <div className="admin-pager"><span>{offset < total ? `${adminInteger(offset + 1)}–${adminInteger(Math.min(offset + limit, total))} / ${adminInteger(total)}` : 'Không còn dòng ở trang này.'}</span>
        <button className="button secondary" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>Trước</button>
        <button className="button secondary" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>Sau</button></div>;
}
export function Metric({ label, value }) { return <article className="admin-metric panel"><span>{label}</span><strong>{adminInteger(value)}</strong></article>; }
export function StatusBadge({ value }) { return <span className={`admin-status ${value}`}>{statusLabel(value)}</span>; }
export function AdminTable({ rows, columns, emptyText = 'Không có dữ liệu phù hợp.' }) {
    return <div className="admin-table-wrap panel"><table><thead><tr>{columns.map(column => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>{columns.map(column => <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)}</tbody></table>
        {!rows.length && <p className="admin-empty">{emptyText}</p>}</div>;
}
export function AdminFilterBar({ resource, filters, onReload }) {
    const { draft, update } = filters;
    const choices = { shops: ['active', 'suspended', 'archived'], users: ['active', 'disabled', 'owner', 'staff'], admins: ['active', 'disabled'], audit: ['store', 'user', 'platform_admin'] };
    const labels = { active: 'Đang hoạt động', suspended: 'Tạm khóa', archived: 'Đã lưu trữ', disabled: 'Vô hiệu',
        owner: 'Chủ tiệm', staff: 'Nhân viên', store: 'Cửa hàng', user: 'Tài khoản', platform_admin: 'Admin' };
    const named = ['shops', 'users', 'admins'].includes(resource);
    const placeholder = { shops: 'Tên tiệm, chủ hoặc email', users: 'Tên hoặc email', admins: 'Tên hoặc email', audit: 'Hành động hoặc lý do', security: 'Loại sự kiện' }[resource];
    return <form className="admin-filter-form" onSubmit={filters.apply}>
        <div className="admin-filters">
            <label className="field">Tìm kiếm<input maxLength={120} value={draft.query} placeholder={placeholder} onChange={event => update('query', event.target.value)}/></label>
            <label className="field">{resource === 'security' ? 'Loại sự kiện' : 'Trạng thái / loại đối tượng'}<select value={draft.filter} onChange={event => update('filter', event.target.value)}>
                <option value="all">Tất cả</option>{(choices[resource] || adminSecurityEvents).map(value => <option key={value} value={value}>{labels[value] || value}</option>)}</select></label>
            {resource === 'shops' && <label className="field">Loại kinh doanh<select value={draft.businessType} onChange={event => update('businessType', event.target.value)}><option value="">Tất cả</option><option value="grocery">Tạp hóa</option><option value="fruit_shop">Trái cây</option></select></label>}
            <label className="field">Sắp xếp<select value={draft.sort} onChange={event => update('sort', event.target.value)}><option value="created_desc">Mới nhất</option><option value="created_asc">Cũ nhất</option>{named && <><option value="name_asc">Tên A → Z</option><option value="name_desc">Tên Z → A</option></>}</select></label>
            <label className="field">Từ ngày<input type="date" value={draft.fromDate} onChange={event => update('fromDate', event.target.value)}/></label>
            <label className="field">Đến hết ngày<input type="date" value={draft.toDate} onChange={event => update('toDate', event.target.value)}/></label>
            {resource === 'audit' && <><label className="field">UUID Admin<input maxLength={36} value={draft.adminId} placeholder="Bỏ trống để xem tất cả" onChange={event => update('adminId', event.target.value)}/></label>
                <label className="field">Hành động<select value={draft.action} onChange={event => update('action', event.target.value)}><option value="">Tất cả</option>{adminActions.map(value => <option key={value} value={value}>{value}</option>)}</select></label></>}
            {resource === 'security' && <label className="field">UUID người dùng<input maxLength={36} value={draft.eventUserId} placeholder="Bỏ trống để xem tất cả" onChange={event => update('eventUserId', event.target.value)}/></label>}
        </div><p className="muted">Ngày được tính theo giờ Việt Nam. Nhấn Áp dụng để cập nhật danh sách.</p>
        {filters.error && <p className="error" role="alert">{filters.error}</p>}
        <div className="admin-inline-actions"><button className="button primary">Áp dụng</button><button type="button" className="button secondary" onClick={filters.reset}>Xóa bộ lọc</button>
            {onReload && <button type="button" className="button secondary" onClick={onReload}>Tải lại dữ liệu</button>}</div>
    </form>;
}
