import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CloudOff, Download, FileJson, LogOut, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore';
import { useShopStore } from '../stores/useShopStore';
import { leaveDemoAccount, readSafetyBackup, restoreDemoBackup } from '../services/accountService';
import { createBackup, downloadBackup, parseBackup } from '../utils/backup';
import { Confirm, Notice, PageHeading } from '../components/ui';
import { formatCurrency } from '../utils/formatters';

export function AccountPage() {
    const profile = useAccountStore(s => s.profile);
    const state = useShopStore();
    const navigate = useNavigate();
    const [pending, setPending] = useState(null);
    const [confirm, setConfirm] = useState(false);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [exit, setExit] = useState(false);
    const input = useRef(null);
    const fileRequest = useRef(0);
    async function exportCurrent() {
        setBusy(true); setError('');
        try { downloadBackup(await createBackup(useShopStore.getState(), profile.id)); setSuccess('Đã tạo file sao lưu đầy đủ. Hãy giữ file ở nơi dễ tìm.'); }
        catch (e) { setError(e.message); }
        finally { setBusy(false); }
    }
    async function chooseFile(file) {
        const request = ++fileRequest.current;
        setPending(null); setChecked(false); setError(''); setSuccess('');
        if (!file) return;
        if (file.size > 8 * 1024 * 1024 + 2048) { setError('File sao lưu tối đa 8 MB.'); return; }
        setBusy(true);
        try { const backup = await parseBackup(await file.text()); if (request === fileRequest.current) setPending({ ...backup, filename: file.name }); }
        catch (e) { if (request === fileRequest.current) setError(e.message); }
        finally { if (request === fileRequest.current) setBusy(false); }
    }
    const totals = snapshot => ({ products: snapshot.products.length, customers: snapshot.customers.length, entries: snapshot.entries.length, debt: snapshot.customers.reduce((sum, c) => sum + c.totalDebt, 0) });
    const current = totals(state);
    const next = pending && totals(pending.state);
    return <><PageHeading title="Tài khoản & sao lưu" description="Quản lý dữ liệu mẫu và giữ một bản dự phòng cho cửa hàng."/>
        <div className="account-profile panel"><span className="choice-icon green"><UserRound size={32}/></span><div><h2>{profile.name}</h2><p>{profile.email || 'Cửa hàng dùng thử có sẵn'}</p><span className="stock-pill">Tài khoản giao diện mẫu</span></div><button className="button secondary" onClick={() => setExit(true)}><LogOut size={18}/> Đổi tài khoản</button></div>
        <div className="info-box account-status"><CloudOff size={24}/><div><b>Chưa kết nối lưu trực tuyến</b><p>Dữ liệu chỉ được giữ trong trình duyệt trên máy này. Email chưa được xác thực, không phải cơ chế bảo mật tài khoản. Khi làm backend, phần này sẽ chuyển sang đăng nhập và lưu dữ liệu thật.</p></div></div>
        {success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}{error && <p className="error" role="alert">{error}</p>}
        <div className="backup-grid"><section className="panel backup-card"><span className="choice-icon blue"><Download size={32}/></span><h2>Tải bản sao lưu đầy đủ</h2><p>Gồm hàng hóa, quy cách, các mức giá, khách, lịch sử giao dịch và giỏ hàng đang chọn.</p><div className="backup-counts"><span>{current.products} mặt hàng</span><span>{current.customers} khách</span><span>{current.entries} giao dịch</span></div><button className="button primary full" disabled={busy} onClick={exportCurrent}><FileJson size={20}/>{busy ? 'Đang xử lý…' : 'Tải bản sao lưu JSON'}</button><small>File không chứa mật khẩu. File CSV hàng hóa không thay thế bản sao lưu này.</small></section>
        <section className="panel backup-card"><span className="choice-icon orange"><Upload size={32}/></span><h2>Khôi phục từ bản sao lưu</h2><p>Chọn file JSON đã tải từ ứng dụng. Bạn sẽ được xem thông tin trước khi thay dữ liệu.</p><input ref={input} type="file" accept=".json,application/json" aria-label="Chọn file sao lưu JSON" disabled={busy} onChange={e => chooseFile(e.target.files?.[0])}/><button className="button secondary full" disabled={busy} onClick={async () => { setError(''); try { const backup = readSafetyBackup(); if (!backup) throw new Error('Chưa có bản dự phòng trước khi khôi phục trên máy này.'); downloadBackup(backup, 'truoc-khi-khoi-phuc'); } catch (e) { setError(e.message); } }}><ShieldCheck size={19}/> Tải bản trước lần khôi phục gần nhất</button><small>Ứng dụng tự giữ bản trước khi khôi phục trên máy này. Nếu trình duyệt đầy bộ nhớ, thao tác sẽ dừng.</small></section></div>
        {pending && <section className="panel restore-preview"><div className="panel-heading"><div><h2>Kiểm tra bản sao lưu</h2><p>{pending.filename} · {new Date(pending.createdAt).toLocaleString('vi-VN')}</p></div></div>{pending.ownerId !== profile.id && <div className="info-box">File này thuộc không gian dữ liệu mẫu khác. Khôi phục sẽ đưa toàn bộ dữ liệu trong file vào <b>{profile.name}</b>.</div>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Thông tin</th><th>Hiện tại</th><th>Sau khôi phục</th></tr></thead><tbody>{[['Mặt hàng', current.products, next.products], ['Khách', current.customers, next.customers], ['Lịch sử giao dịch', current.entries, next.entries], ['Tổng nợ', formatCurrency(current.debt), formatCurrency(next.debt)]].map(([label, before, after]) => <tr key={label}><td>{label}</td><td>{before}</td><td>{after}</td></tr>)}</tbody></table></div><div className="restore-actions"><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/> Tôi hiểu dữ liệu hiện tại sẽ được thay bằng bản sao lưu này.</label><button className="button danger" disabled={!checked || busy} onClick={() => setConfirm(true)}>Khôi phục dữ liệu</button></div></section>}
        <p className="page-hint">Bạn có thể hủy đơn bán nhầm tại <Link className="text-link" to="/history">Lịch sử hoạt động</Link>.</p>
        {confirm && pending && <Confirm danger title="Thay dữ liệu bằng bản sao lưu?" label="Đúng, khôi phục" onClose={() => setConfirm(false)} onConfirm={async () => { await restoreDemoBackup(pending); setConfirm(false); setPending(null); setChecked(false); if (input.current) input.current.value = ''; setSuccess('Đã khôi phục dữ liệu mẫu. Bản trước khi khôi phục được giữ riêng trên máy này.'); }}><p>Thay dữ liệu của <b>{profile.name}</b> bằng file <b>{pending.filename}</b>?</p><p>Ứng dụng lưu một bản trước khi khôi phục rồi mới thay dữ liệu hiện tại.</p></Confirm>}
        {exit && <Confirm title="Đổi tài khoản mẫu?" label="Đến màn hình đăng nhập" onClose={() => setExit(false)} onConfirm={() => { leaveDemoAccount(); navigate('/login', { replace: true }); }}><p>Dữ liệu của tài khoản mẫu này vẫn được giữ trong trình duyệt. Bạn có thể mở lại bằng cùng email mẫu.</p></Confirm>}
    </>;
}
