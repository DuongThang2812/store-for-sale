import { useEffect, useRef, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore';
import { shopSettingsService } from '../services/shopSettingsService';
import { storeService } from '../services/storeService';
import { createRequestJournal } from '../services/requestJournal';
import { createCloudCommandRunner } from '../services/cloudCommandRunner';
import { Confirm, Modal, Notice, PageHeading } from '../components/ui';
import { businessTypeLabel } from '../domain/businessTypes';

const journal = createRequestJournal();
const command = createCloudCommandRunner({ journal, context: () => {
    const { user, store } = useAccountStore.getState();
    return { scope: user, actorId: user?.id, storeId: store?.id };
} });

export function ShopSettingsPage() {
    const store = useAccountStore(state => state.store);
    if (store.role !== 'owner') return <p className="info-box">Chỉ chủ tiệm được quản lý cài đặt và nhân viên.</p>;
    return <><PageHeading title="Cài đặt cửa hàng" description="Thông tin cửa hàng và quyền làm việc của từng nhân viên."/>
        <div className="backup-grid"><StoreDetails key={store.id} store={store}/><StaffList key={store.id} store={store}/></div></>;
}

function StoreDetails({ store }) {
    const [name, setName] = useState(store.name);
    const [phone, setPhone] = useState(store.phone);
    const [address, setAddress] = useState(store.address);
    const [version, setVersion] = useState(store.settingsVersion);
    const [confirm, setConfirm] = useState(false);
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    function applySettings(fresh) {
        useAccountStore.getState().setStore(fresh);
        setName(fresh.name); setPhone(fresh.phone); setAddress(fresh.address);
        setVersion(fresh.settingsVersion);
    }
    async function reload() {
        const user = useAccountStore.getState().user;
        setLoading(true); setError(''); setSuccess('');
        try {
            const fresh = await storeService.getStore(store.id);
            const now = useAccountStore.getState();
            if (now.user !== user || now.store?.id !== store.id) throw new Error('Phiên hoặc cửa hàng đã đổi. Hãy mở lại cài đặt.');
            applySettings(fresh);
            setSuccess('Đã tải thông tin mới nhất từ DB.');
        } catch (cause) { setError(cause.message); }
        finally { setLoading(false); }
    }
    return <section className="panel form-panel"><h2>Thông tin tiệm</h2>
        {success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}
        {error && <p className="error" role="alert">{error}</p>}
        <form onSubmit={event => { event.preventDefault(); setConfirm(true); }}>
            <label className="field">Tên cửa hàng<input required maxLength={120} value={name} onChange={event => setName(event.target.value)}/></label>
            <label className="field">Điện thoại<input type="tel" maxLength={30} value={phone} onChange={event => setPhone(event.target.value)}/></label>
            <label className="field">Địa chỉ<textarea maxLength={300} rows={3} value={address} onChange={event => setAddress(event.target.value)}/></label>
            <p className="muted">{businessTypeLabel(store.businessType)} · VNĐ · Asia/Ho_Chi_Minh</p>
            <p className="muted">Loại kinh doanh được giữ nguyên để bảo toàn quy cách và lịch sử hàng.</p>
            <button className="button primary full" disabled={loading || !name.trim()}>Lưu thông tin</button>
        </form>
        <button className="button secondary full" disabled={loading || confirm} onClick={reload}>{loading ? 'Đang tải…' : 'Tải lại từ DB'}</button>
        {confirm && <Confirm title="Lưu cài đặt cửa hàng?" label="Lưu vào DB" onClose={() => setConfirm(false)} onConfirm={async () => {
            const payload = { name, phone, address, expectedVersion: version };
            let fresh;
            await command(store.id, 'settings', payload,
                requestId => shopSettingsService.saveSettings(store.id, { ...payload, requestId }),
                async () => { fresh = await storeService.getStore(store.id); });
            applySettings(fresh);
            setConfirm(false); setError(''); setSuccess('Đã lưu thông tin cửa hàng.');
        }}><p>{name} · {phone || 'Chưa thêm điện thoại'}</p><p>{address || 'Chưa thêm địa chỉ'}</p></Confirm>}
    </section>;
}

function StaffList({ store }) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [offset, setOffset] = useState(0);
    const [revision, setRevision] = useState(0);
    const [editor, setEditor] = useState(null);
    const request = useRef(0);
    const key = `${offset}:${revision}`;
    useEffect(() => {
        const id = ++request.current;
        void shopSettingsService.listStaff(store.id, { offset }).then(page => {
            if (id === request.current) { setResult({ ...page, key }); setError(''); }
        }).catch(cause => { if (id === request.current) { setError(cause.message); setResult({ key, failed: true }); } });
        return () => { request.current += 1; };
    }, [store.id, offset, revision, key]);
    const page = result?.key === key ? result : null;
    return <section className="panel form-panel"><div className="panel-heading"><h2>Nhân viên</h2><button className="button secondary" onClick={() => setEditor({})}>Thêm nhân viên</button></div>
        <p className="muted">Nhân viên đăng ký tài khoản trước. Thêm bằng email đó; ứng dụng không tự gửi thư mời hoặc tạo mật khẩu.</p>
        {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
        {error && <p className="error" role="alert">{error}</p>}
        {!page ? <p role="status">Đang tải danh sách từ DB…</p> : page.failed ? <button className="button secondary" onClick={() => setRevision(value => value + 1)}>Thử lại</button> : <>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Nhân viên</th><th>Quyền</th><th>Trạng thái</th><th/></tr></thead><tbody>{page.rows.map(row => <tr key={row.user_id}>
                <td><b>{row.display_name}</b><p>{row.email}</p></td><td>{row.role === 'owner' ? 'Chủ tiệm' : [row.can_sell && 'Bán', row.can_receive_stock && 'Nhập', row.can_manage_debt && 'Công nợ'].filter(Boolean).join(' · ') || 'Chỉ xem kho'}</td>
                <td>{row.account_status === 'disabled' ? 'Tài khoản bị khóa' : row.is_active ? 'Đang làm việc' : 'Tạm ngừng'}</td>
                <td>{row.role === 'staff' && <button className="button secondary" onClick={() => setEditor(row)}>Sửa quyền</button>}</td></tr>)}</tbody></table></div>
            {page.total > 30 && <div className="modal-actions"><button className="button secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0,value-30))}>Trước</button>
                <span>{offset+1}–{Math.min(offset+30,page.total)} / {page.total}</span><button className="button secondary" disabled={offset+30 >= page.total} onClick={() => setOffset(value => value+30)}>Sau</button></div>}
        </>}
        {editor && <StaffEditor store={store} member={editor} onClose={() => setEditor(null)} onDone={() => {
            setEditor(null); setRevision(value => value + 1); setNotice('Đã lưu quyền nhân viên trên DB. Lịch sử giao dịch vẫn được giữ.');
        }}/>}</section>;
}

function StaffEditor({ store, member, onClose, onDone }) {
    const [email, setEmail] = useState(member.email || '');
    const [canSell, setSell] = useState(member.can_sell ?? true);
    const [canReceiveStock, setReceive] = useState(member.can_receive_stock ?? false);
    const [canManageDebt, setDebt] = useState(member.can_manage_debt ?? false);
    const [isActive, setActive] = useState(member.is_active ?? true);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    async function save() {
        setBusy(true); setError('');
        try {
            const payload = { email: member.user_id ? null : email, userId: member.user_id || null,
                expectedVersion: member.permission_version || null, canSell, canReceiveStock, canManageDebt, isActive };
            await command(store.id, 'staff', payload,
                requestId => shopSettingsService.saveStaff(store.id, { ...payload, requestId }), async () => {});
            onDone();
        } catch (cause) { setError(cause.message); setBusy(false); }
    }
    return <Modal title={member.user_id ? 'Sửa quyền nhân viên' : 'Thêm nhân viên'} onClose={() => { if (!busy) onClose(); }}>
        {!confirm ? <form onSubmit={event => { event.preventDefault(); setConfirm(true); }}>
            <label className="field">Email đã đăng ký<input required type="email" maxLength={254} disabled={!!member.user_id} value={email} onChange={event => setEmail(event.target.value)}/></label>
            <label className="checkbox-field"><input type="checkbox" checked={canSell} onChange={event => setSell(event.target.checked)}/> Bán hàng trả ngay</label>
            <label className="checkbox-field"><input type="checkbox" checked={canReceiveStock} onChange={event => setReceive(event.target.checked)}/> Nhập thêm hàng đã có</label>
            <label className="checkbox-field"><input type="checkbox" checked={canManageDebt} onChange={event => setDebt(event.target.checked)}/> Quản lý khách, ghi nợ và nhận trả nợ</label>
            <p className="muted">Bán mua chịu cần cả quyền bán và quyền công nợ. Nhân viên không được xem giá vốn/lãi, quản lý nhân viên hoặc hủy đơn.</p>
            {member.user_id && <label className="checkbox-field"><input type="checkbox" checked={isActive} onChange={event => setActive(event.target.checked)}/> Còn làm việc tại tiệm</label>}
            <button className="button primary full">Xem xác nhận</button>
        </form> : <><p>Lưu quyền cho <b>{email}</b> tại <b>{store.name}</b>?</p><p>{isActive ? 'Có thể vào cửa hàng theo quyền đã chọn.' : 'Tạm ngừng quyền vào cửa hàng; giữ toàn bộ lịch sử.'}</p>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="modal-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Quay lại</button><button className="button primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu quyền'}</button></div></>}
    </Modal>;
}
