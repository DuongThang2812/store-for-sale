import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CloudOff, Download, FileJson, LogOut, ShieldCheck, Upload, UserRound } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore';
import { useShopStore } from '../stores/useShopStore';
import { localShopStorageKey, readSafetyBackup, restoreLocalBackup } from '../services/accountService';
import { authService } from '../services/authService';
import { accountSession } from '../services/accountSession';
import { createBackup, downloadBackup, parseBackup } from '../utils/backup';
import { Confirm, Notice, PageHeading } from '../components/ui';
import { formatCurrency } from '../utils/formatters';
import { businessTypeLabel } from '../domain/businessTypes';

export function AccountPage() {
    const migrationWarning = useLocation().state?.migrationWarning;
    const profile = useAccountStore(s => s.profile);
    const user = useAccountStore(s => s.user);
    const store = useAccountStore(s => s.store);
    const stores = useAccountStore(s => s.stores);
    const dataMode = useAccountStore(s => s.dataMode);
    const state = useShopStore();
    const navigate = useNavigate();
    const [pending, setPending] = useState(null);
    const [confirm, setConfirm] = useState(false);
    const [checked, setChecked] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(migrationWarning || '');
    const [success, setSuccess] = useState('');
    const [exit, setExit] = useState(false);
    const input = useRef(null);
    const fileRequest = useRef(0);
    async function exportCurrent() {
        setBusy(true); setError('');
        try { downloadBackup(await createBackup(useShopStore.getState(), localShopStorageKey(user.id, store.id))); setSuccess('Đã tạo file sao lưu dữ liệu trên máy. Hãy giữ file ở nơi dễ tìm.'); }
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
    return <><PageHeading title="Tài khoản & sao lưu" description="Quản lý tài khoản và giữ một bản dự phòng cho cửa hàng."/>
        <div className="account-profile panel"><span className="choice-icon green"><UserRound size={32}/></span><div><h2>{profile.name}</h2><p>{user.email}</p><p>{store.name} · {businessTypeLabel(store.businessType)} · {store.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'}</p></div><Link className="button secondary" to="/setup">{stores.length > 1 ? 'Đổi / thêm cửa hàng' : 'Thêm cửa hàng'}</Link><button className="button secondary" onClick={() => setExit(true)}><LogOut size={18}/> Đăng xuất</button></div>
        <div className="info-box account-status"><CloudOff size={24}/><div><b>{dataMode === 'supabase' ? 'Giao dịch đang lưu trên Supabase DB' : 'Giao dịch hiện lưu trên máy này'}</b><p>{dataMode === 'supabase' ? 'Bán hàng, kho và công nợ dùng dữ liệu từ DB. Bản sao JSON trên máy không phải bản sao đầy đủ của DB; cần dùng chính sách sao lưu database của Supabase.' : 'Đăng nhập và cửa hàng dùng Supabase Auth/DB. Bán hàng, kho, nợ và bản sao lưu vẫn nằm trong trình duyệt, chưa đồng bộ lên DB. Chỉ dùng trên máy tin cậy và tải bản sao lưu thường xuyên.'}</p></div></div>
        {dataMode === 'demo' && store.role === 'owner' && <div className="info-box"><ShieldCheck size={23}/><div><b>Chuẩn bị chuyển dữ liệu cũ lên DB</b><p>Kiểm tra tồn, công nợ và lịch sử, tải sao lưu, rồi chuyển bản cũ vào Supabase an toàn.</p><Link className="text-link" to="/account/migrate">Mở trình chuyển dữ liệu <Upload size={17}/></Link></div></div>}
        {success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}{error && <p className="error" role="alert">{error}</p>}
        {dataMode === 'demo' && <div className="backup-grid"><section className="panel backup-card"><span className="choice-icon blue"><Download size={32}/></span><h2>Tải bản sao lưu trên máy</h2><p>Gồm hàng hóa, khách, lịch sử và giỏ hàng lưu trên máy này. Danh mục và nhà cung cấp trên DB chưa nằm trong file.</p><div className="backup-counts"><span>{current.products} mặt hàng</span><span>{current.customers} khách</span><span>{current.entries} giao dịch</span></div><button className="button primary full" disabled={busy} onClick={exportCurrent}><FileJson size={20}/>{busy ? 'Đang xử lý…' : 'Tải bản sao lưu JSON'}</button><small>File không chứa mật khẩu. File CSV hàng hóa không thay thế bản sao lưu này.</small></section>
        <section className="panel backup-card"><span className="choice-icon orange"><Upload size={32}/></span><h2>Khôi phục từ bản sao lưu</h2><p>Chọn file JSON đã tải từ ứng dụng. Bạn sẽ được xem thông tin trước khi thay dữ liệu.</p><input ref={input} type="file" accept=".json,application/json" aria-label="Chọn file sao lưu JSON" disabled={busy} onChange={e => chooseFile(e.target.files?.[0])}/><button className="button secondary full" disabled={busy} onClick={async () => { setError(''); try { const backup = readSafetyBackup(); if (!backup) throw new Error('Chưa có bản dự phòng trước khi khôi phục trên máy này.'); downloadBackup(backup, 'truoc-khi-khoi-phuc'); } catch (e) { setError(e.message); } }}><ShieldCheck size={19}/> Tải bản trước lần khôi phục gần nhất</button><small>Ứng dụng tự giữ bản trước khi khôi phục trên máy này. Nếu trình duyệt đầy bộ nhớ, thao tác sẽ dừng.</small></section></div>}
        {dataMode === 'demo' && pending && <section className="panel restore-preview"><div className="panel-heading"><div><h2>Kiểm tra bản sao lưu</h2><p>{pending.filename} · {new Date(pending.createdAt).toLocaleString('vi-VN')}</p></div></div>{pending.ownerId !== localShopStorageKey(user.id, store.id) && <div className="info-box">File này thuộc không gian dữ liệu khác. Chỉ khôi phục nếu bạn chắc chắn muốn đưa dữ liệu đó vào <b>{store.name}</b>.</div>}<div className="table-scroll"><table className="data-table"><thead><tr><th>Thông tin</th><th>Hiện tại</th><th>Sau khôi phục</th></tr></thead><tbody>{[['Mặt hàng', current.products, next.products], ['Khách', current.customers, next.customers], ['Lịch sử giao dịch', current.entries, next.entries], ['Tổng nợ', formatCurrency(current.debt), formatCurrency(next.debt)]].map(([label, before, after]) => <tr key={label}><td>{label}</td><td>{before}</td><td>{after}</td></tr>)}</tbody></table></div><div className="restore-actions"><label className="checkbox-field"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/> Tôi hiểu dữ liệu hiện tại sẽ được thay bằng bản sao lưu này.</label><button className="button danger" disabled={!checked || busy} onClick={() => setConfirm(true)}>Khôi phục dữ liệu</button></div></section>}
        <p className="page-hint">Bạn có thể hủy đơn bán nhầm tại <Link className="text-link" to="/history">Lịch sử hoạt động</Link>.</p>
        {dataMode === 'demo' && confirm && pending && <Confirm danger title="Thay dữ liệu bằng bản sao lưu?" label="Đúng, khôi phục" onClose={() => setConfirm(false)} onConfirm={async () => { await restoreLocalBackup(pending); setConfirm(false); setPending(null); setChecked(false); if (input.current) input.current.value = ''; setSuccess('Đã khôi phục dữ liệu trên máy. Bản trước khi khôi phục được giữ riêng.'); }}><p>Thay dữ liệu của <b>{store.name}</b> bằng file <b>{pending.filename}</b>?</p><p>Ứng dụng lưu một bản trước khi khôi phục rồi mới thay dữ liệu hiện tại.</p></Confirm>}
        {exit && <Confirm title="Đăng xuất?" label="Đăng xuất" onClose={() => setExit(false)} onConfirm={async () => { setBusy(true); setError(''); try { await authService.signOut(); accountSession.signedOut(); navigate('/login', { replace: true }); } catch { setError('Chưa đăng xuất được. Vui lòng thử lại.'); } finally { setBusy(false); setExit(false); } }}><p>Bạn sẽ cần đăng nhập lại để mở cửa hàng. Dữ liệu giao dịch trên máy vẫn được giữ để dùng sau.</p></Confirm>}
    </>;
}
