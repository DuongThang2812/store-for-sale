import { useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Link } from 'react-router-dom';
import { ArrowRight, FileSpreadsheet, Upload, Check } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { Confirm, Notice, PageHeading } from '../components/ui';
import { formatCurrency } from '../utils/formatters';
import { parseCatalogWorkbook, planCatalogDraftImport } from '../utils/catalogWorkbook';
import { CloudCatalogImport } from '../components/CloudCatalogImport';

export function CatalogImportPage() {
    const { products, importCatalogDrafts } = useShopStore(useShallow(s => ({ products: s.products, importCatalogDrafts: s.importCatalogDrafts })));
    const [records, setRecords] = useState([]);
    const [filename, setFilename] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [success, setSuccess] = useState('');
    const [mode, setMode] = useState('cloud');
    const [requestId, setRequestId] = useState('');
    const request = useRef(0);
    const input = useRef(null);
    const plan = useMemo(() => records.length ? planCatalogDraftImport(records, products) : { create: [], skipped: 0 }, [records, products]);

    async function readFile(file) {
        const current = ++request.current;
        setRecords([]); setFilename(''); setError(''); setSuccess(''); setRequestId('');
        if (!file) return;
        if (!/\.xlsx$/i.test(file.name)) { setError('Vui lòng chọn file Excel .xlsx.'); return; }
        if (file.size > 2 * 1024 * 1024) { setError('File quá lớn. Hãy chia thành file nhỏ hơn 2 MB.'); return; }
        setBusy(true);
        try {
            const { default: readXlsxFile } = await import('read-excel-file/browser');
            const sheets = await readXlsxFile(file);
            const parsed = parseCatalogWorkbook(sheets);
            if (current !== request.current) return;
            setRecords(parsed); setFilename(file.name); setRequestId(crypto.randomUUID());
        } catch (e) { if (current === request.current) setError(e.message || 'Không đọc được file Excel.'); }
        finally { if (current === request.current) setBusy(false); }
    }
    function commit() {
        try {
            const result = importCatalogDrafts(records);
            setSuccess(`Đã thêm ${result.created} mặt hàng nháp từ ${filename}. ${result.skipped} tên trùng được bỏ qua.`);
            setRecords([]); setFilename(''); setConfirm(false);
            if (input.current) input.current.value = '';
        } catch (e) { setError(e.message); setConfirm(false); }
    }
    return <>
        <PageHeading title="Nhập danh mục từ Excel" description="Một file, mỗi nhóm hàng một sheet. Chọn lưu vào DB hoặc dữ liệu trên máy." back="/import"/>
        <div className="filter-tabs" aria-label="Nơi lưu danh mục"><button className={mode === 'cloud' ? 'selected' : ''} onClick={() => setMode('cloud')}>Lưu vào Supabase DB</button><button className={mode === 'demo' ? 'selected' : ''} onClick={() => setMode('demo')}>Lưu trên máy</button></div>
        {success && <Notice action={<Link className="text-link" to="/inventory?filter=inactive">Xem hàng nháp <ArrowRight size={18}/></Link>}>{success}</Notice>}
        <div className="csv-intro-grid">
            <section className="panel csv-upload"><span className="choice-icon blue"><Upload size={36}/></span><h2>Chọn file danh mục</h2><p>Excel .xlsx · Tối đa 2 MB hoặc 2.000 mặt hàng</p>
                <input ref={input} className="csv-file-input" id="catalog-xlsx-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={e => readFile(e.target.files?.[0])}/>
                <label className={`button primary ${busy ? 'disabled' : ''}`} htmlFor="catalog-xlsx-file"><FileSpreadsheet size={20}/>{busy ? 'Đang đọc file…' : 'Chọn file Excel'}</label><span className="file-name" role="status">{filename || 'Chưa chọn file'}</span>
            </section>
            <section className="panel csv-guide"><h2>Sau khi nhập sẽ ra sao?</h2><ol><li>Mỗi sheet là một nhóm hàng. Tên trùng được đối chiếu, không ghi đè hàng đang có.</li><li>Hàng mới ở trạng thái ngừng bán, tồn kho 0. Giá nhập được giữ làm dữ liệu nguồn.</li><li>Xác nhận đơn vị, quy cách, giá bán và tồn thực tế trước khi bật bán.</li></ol></section>
        </div>
        <div className="info-box csv-rules"><b>Giá trong file là giá nhập từ danh sách bạn gửi.</b><p>Những số viết tắt, giá bậc, chương trình tặng hàng và dòng chưa có giá cần kiểm tra lại. File không chứa số lượng tồn thực tế. Nhập file này sẽ không cộng kho hay tạo giao dịch mua bán.</p></div>
        {error && <p className="error" role="alert">{error}</p>}
        {mode === 'cloud' && <CloudCatalogImport records={records} filename={filename} requestId={requestId}/>}
        {records.length > 0 && <section className="panel csv-preview"><div className="panel-heading"><div><h2>Xem trước danh mục</h2><p>{mode === 'demo' ? `${records.length} dòng · ${plan.create.length} hàng nháp mới · ${plan.skipped} tên trùng bỏ qua` : `${records.length} dòng nguồn · Tên trùng sẽ được đối chiếu trong DB`}</p></div><span className="stock-pill">File Excel</span></div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Mặt hàng</th><th>Nhóm</th><th>Giá nhập tham khảo</th><th>Giá bán</th></tr></thead><tbody>{records.slice(0, 30).map((row, index) => <tr key={`${row.sourceId}-${index}`}><td><strong>{row.name}</strong><small>{row.sourceId} · {row.supplierQuote.reviewNote || 'Cần xác nhận quy cách'}</small></td><td>{row.category}</td><td>{row.supplierQuote.purchasePrice === null ? 'Chưa rõ' : formatCurrency(row.supplierQuote.purchasePrice)}{row.supplierQuote.purchaseUnit ? ` / ${row.supplierQuote.purchaseUnit}` : ''}</td><td>{row.salePrice === null ? 'Chưa có' : formatCurrency(row.salePrice)}</td></tr>)}</tbody></table></div>
            {records.length > 30 && <p className="page-hint">Đang hiện 30 dòng đầu; toàn bộ {records.length} dòng sẽ được xử lý.</p>}
            {mode === 'demo' && <div className="csv-actions"><p>Nhập danh mục nháp không thay đổi tồn kho, công nợ hay doanh thu.</p><button className="button primary" disabled={!plan.create.length} onClick={() => setConfirm(true)}><Check size={20}/> Thêm {plan.create.length} hàng nháp trên máy</button></div>}
        </section>}
        {confirm && <Confirm title="Nhập danh mục hàng nháp?" onClose={() => setConfirm(false)} label="Đúng, thêm hàng nháp" onConfirm={commit}><p>Thêm <b>{plan.create.length} mặt hàng nháp</b> từ {filename}?</p><p>Các hàng này chưa bán được và tồn kho luôn bắt đầu từ 0. {plan.skipped} tên trùng sẽ được giữ nguyên trong kho.</p></Confirm>}
    </>;
}
