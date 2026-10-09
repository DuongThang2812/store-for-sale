import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, ShieldCheck } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { prepareLegacyMigration, readLegacyShop } from '../services/legacyMigration.js';
import { legacyImportService } from '../services/legacyImportService.js';
import { accountSession } from '../services/accountSession.js';
import { createBackup, downloadBackup } from '../utils/backup.js';
import { Confirm, PageHeading } from '../components/ui.jsx';
import { formatCurrency } from '../utils/formatters.js';

export function LegacyMigrationPage() {
    const user = useAccountStore(state => state.user);
    const store = useAccountStore(state => state.store);
    const dataMode = useAccountStore(state => state.dataMode);
    const navigate = useNavigate();
    const [prepared, setPrepared] = useState(null);
    const [acknowledged, setAcknowledged] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [result, setResult] = useState(null);
    const request = useRef(null);

    async function prepare() {
        setBusy(true); setError(''); setPrepared(null); setResult(null); setAcknowledged(false);
        try {
            const next = await prepareLegacyMigration(user.id, store.id);
            if (!next) throw new Error('Không có dữ liệu cũ của cửa hàng này trên trình duyệt.');
            downloadBackup(next.backup, 'truoc-khi-chuyen-du-lieu');
            request.current = crypto.randomUUID();
            setPrepared(next);
        } catch (cause) { setError(cause.message); }
        finally { setBusy(false); }
    }

    async function commit() {
        // The exact snapshot and request ID are retained across network retries.
        const live = readLegacyShop(user.id, store.id);
        if (!live) throw new Error('Dữ liệu trên máy đã thay đổi. Hãy kiểm tra và sao lưu lại.');
        const liveBackup = await createBackup(live.state, live.key);
        if (liveBackup.checksum !== prepared.backup.checksum) {
            throw new Error('Dữ liệu trên máy đã đổi sau khi tải sao lưu. Hãy kiểm tra lại trước khi chuyển.');
        }
        let done;
        try {
            done = await legacyImportService.importSnapshot(store.id, {
                backup: prepared.backup,
                persistVersion: prepared.persistVersion,
                requestId: request.current,
            });
        } catch (cause) {
            if (cause.importCommitted && useAccountStore.getState().store?.id === store.id) {
                useAccountStore.setState({ dataMode: 'supabase' });
                navigate('/account', { replace: true, state: { migrationWarning: cause.message } });
            }
            throw cause;
        }
        setResult(done);
        setConfirm(false);
        setError('');
        // Stop local writes immediately after reconciliation, even if Auth refresh fails.
        if (useAccountStore.getState().store?.id === store.id) {
            useAccountStore.setState({ dataMode: 'supabase' });
        }
    }

    if (store.role !== 'owner') return <><PageHeading title="Chuyển dữ liệu cũ" back="/account"/>
        <div className="info-box">Chỉ chủ tiệm được chuyển dữ liệu từ máy lên DB.</div></>;
    if (dataMode === 'supabase' && !result) return <><PageHeading title="Chuyển dữ liệu cũ" back="/account"/>
        <div className="info-box">Cửa hàng này đang dùng dữ liệu Supabase DB. Không thể nhập lại lịch sử từ máy.</div></>;
    const report = prepared?.report;
    const blocking = !!(report?.review.debtDiscrepancies.length || report?.review.orphanOutstandingCustomerCount);
    return <><PageHeading title="Chuyển dữ liệu từ máy lên DB" description="Giữ nguyên lịch sử cũ, đưa tồn kho và số nợ hiện tại sang cửa hàng đã chọn." back="/account"/>
        <div className="info-box"><ShieldCheck size={23}/><div><b>{store.name}</b><p>Ứng dụng chỉ đọc dữ liệu gắn với tài khoản và cửa hàng này. Bản cũ trên máy sẽ không bị xóa. Hãy lưu file JSON vừa tải ở nơi an toàn.</p></div></div>
        {error && <p className="error" role="alert">{error}</p>}
        {!prepared && !result && <section className="panel backup-card"><h2>1. Kiểm tra và tải sao lưu</h2><p>Kiểm tra số lượng hàng, khách và lịch sử trước khi ghi DB. Thao tác này tự tải file JSON có mã kiểm tra.</p><button className="button primary" disabled={busy} onClick={prepare}><Download size={19}/>{busy ? 'Đang kiểm tra…' : 'Kiểm tra & tải sao lưu'}</button></section>}
        {report && !result && <section className="panel restore-preview"><h2>2. Đối chiếu bản trên máy</h2>
            <div className="backup-counts"><span>{report.counts.products} mặt hàng</span><span>{report.counts.customers} khách</span><span>{report.counts.sales} đơn cũ</span><span>{report.counts.receipts} lần nhập</span><span>{report.counts.payments} lần trả nợ</span><span>{report.counts.adjustments} lần hao hụt</span></div>
            <p>Số nợ chuyển đầu kỳ: <b>{formatCurrency(report.totals.outstandingDebt)}</b>.</p>
            <p>{report.counts.archiveOnlySales} đơn không có chi tiết món, {report.review.missingProductLines.length} dòng tham chiếu hàng không còn trong kho. Các bản ghi này được lưu nguyên văn trong lịch sử cũ, không tự cộng lại kho hay doanh thu.</p>
            <p>Giá vốn của các đơn cũ chưa rõ sẽ giữ trạng thái chưa xác định. Giỏ hàng tạm thời vẫn nằm trong file sao lưu trên máy.</p>
            {blocking && <p className="error" role="alert">Sổ nợ chưa khớp: {report.review.debtDiscrepancies.length} khách lệch số dư và {report.review.orphanOutstandingCustomerCount} khách đã xóa còn nợ trong lịch sử. Hãy đối chiếu trước khi chuyển.</p>}
            <label className="checkbox-field"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/> Tôi đã giữ file JSON sao lưu và hiểu các giao dịch cũ sẽ được lưu làm lịch sử đối chiếu.</label>
            <button className="button primary" disabled={!acknowledged || blocking} onClick={() => setConfirm(true)}>Chuyển vào DB <ArrowRight size={18}/></button>
        </section>}
        {result && <section className="panel success-panel" role="status"><ShieldCheck size={38}/><h2>DB đã nhận và đối chiếu dữ liệu</h2><p>{result.counts.products} mặt hàng, {result.counts.customers} khách, {result.counts.entries} dòng lịch sử. Tồn: {result.counts.stock_base_total} đơn vị gốc; công nợ: {formatCurrency(Number(result.counts.outstanding_debt))}.</p><p>File và dữ liệu trên máy vẫn còn. Từ đây các thao tác mới sẽ dùng DB.</p><button className="button primary" onClick={async () => { await accountSession.refresh(store.id); navigate('/', { replace: true }); }}>Mở cửa hàng trên DB <ArrowRight size={18}/></button></section>}
        {confirm && <Confirm title={`Chuyển dữ liệu vào ${store.name}?`} label="Đúng, chuyển dữ liệu" onClose={() => setConfirm(false)} onConfirm={commit}><p>Nhập tồn hiện tại và số nợ đầu kỳ vào DB trong một giao dịch. Lịch sử cũ được giữ để đối chiếu, không phát lại các lần bán/nhập hàng.</p><p>Nếu DB đã có giao dịch hoặc hàng đang bán, hệ thống sẽ dừng và không ghi đè.</p></Confirm>}
    </>;
}
