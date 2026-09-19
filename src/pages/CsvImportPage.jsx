import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, FileSpreadsheet, Upload, Check } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { Confirm, Notice, PageHeading } from '../components/ui';
import { PRODUCT_GROUPS } from '../utils/productPricing';
import { parseStockCsv, planStockImport, stockCsvTemplate } from '../utils/stockCsv';
import { exportCsv } from '../utils/shopHelpers';
import { formatCurrency } from '../utils/formatters';

export function CsvImportPage() {
    const { products, importProducts } = useShopStore();
    const [rows, setRows] = useState([]);
    const [templateGroup, setTemplateGroup] = useState('snacks');
    const [filename, setFilename] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [success, setSuccess] = useState('');
    const input = useRef(null);
    const request = useRef(0);
    let plan = [], planError = '';
    if (rows.length) {
        try { plan = planStockImport(rows, products); }
        catch (e) { planError = e.message; }
    }
    const existingCount = plan.filter(row => row.productId).length;
    const totalQuantity = plan.reduce((sum, row) => sum + row.quantity, 0);
    async function readFile(file) {
        const current = ++request.current;
        setRows([]); setError(''); setSuccess(''); setFilename('');
        if (!file) return;
        if (!/\.csv$/i.test(file.name)) { setError('Vui lòng chọn file có đuôi .csv.'); return; }
        if (file.size > 2 * 1024 * 1024) { setError('File quá lớn. Vui lòng chia thành file nhỏ hơn 2 MB.'); return; }
        setBusy(true);
        try {
            const text = await file.text();
            if (current !== request.current) return;
            if (text.includes('\uFFFD')) throw new Error('File chưa dùng bảng mã UTF-8. Hãy lưu lại bằng định dạng CSV UTF-8 để giữ đúng tiếng Việt.');
            const parsed = parseStockCsv(text);
            planStockImport(parsed, products);
            setRows(parsed); setFilename(file.name);
        } catch (e) { if (current === request.current) setError(e.message); }
        finally { if (current === request.current) setBusy(false); }
    }
    return <>
        <PageHeading title="Nhập hàng từ file CSV" description="Thêm nhiều mặt hàng vào kho trong một lần." back="/import" />
        {success && <Notice action={<Link className="text-link" to="/inventory">Xem kho <ArrowRight size={18}/></Link>}>{success}</Notice>}
        <div className="csv-intro-grid">
            <section className="panel csv-upload">
                <span className="choice-icon blue"><Upload size={36}/></span>
                <h2>Chọn danh sách hàng cần nhập</h2>
                <p>File CSV UTF-8 · Tối đa 2 MB hoặc 2.000 mặt hàng</p>
                <input ref={input} className="csv-file-input" id="stock-csv-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => readFile(e.target.files?.[0])}/>
                <label className={`button primary ${busy ? 'disabled' : ''}`} htmlFor="stock-csv-file"><FileSpreadsheet size={20}/>{busy ? 'Đang đọc file…' : 'Chọn file CSV'}</label>
                <span className="file-name" role="status">{filename || 'Chưa chọn file'}</span>
            </section>
            <section className="panel csv-guide">
                <h2>Chuẩn bị file thật đơn giản</h2>
                <ol><li>Tải file mẫu và mở bằng Excel.</li><li>Chọn mẫu đúng nhóm, điền giá nhập, giá bán và quy cách. Cột “Giá bán” là giá bán lẻ theo “Đơn vị bán lẻ”.</li><li>Lưu dưới dạng CSV UTF-8 rồi chọn file bên cạnh.</li></ol>
                <label className="field">File mẫu theo nhóm<select value={templateGroup} onChange={e => setTemplateGroup(e.target.value)}>{PRODUCT_GROUPS.map(g => <option value={g.id} key={g.id}>{g.label}</option>)}</select></label><p className="muted">Giá và quy cách trong mẫu chỉ là ví dụ; hãy thay bằng hàng thực tế của tiệm.</p><button className="button secondary" onClick={() => exportCsv(`mau-nhap-${templateGroup}.csv`, stockCsvTemplate(templateGroup))}><Download size={19}/> Tải file mẫu</button>
            </section>
        </div>
        <div className="info-box csv-rules"><b>Cách cộng hàng vào kho</b><p>Trùng tên: cộng tồn theo quy đổi đã khai báo và giữ giá hiện tại. Tên mới: tạo mặt hàng cùng các giá và quy cách trong file. Cột “Còn lại” trong file tải từ kho cũng được hiểu là số lượng nhập thêm, không phải thay thế số tồn.</p></div>
        {(error || planError) && <p className="error" role="alert">{error || planError}</p>}
        {plan.length > 0 && <section className="panel csv-preview">
            <div className="panel-heading"><div><h2>Kiểm tra trước khi nhập</h2><p>{plan.length} mặt hàng · {existingCount} hàng đã có · {plan.length - existingCount} hàng mới</p></div><span className="stock-pill">Chưa lưu vào kho</span></div>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Mặt hàng</th><th>Giá bán</th><th>Hiện có</th><th>Nhập thêm</th><th>Sau khi nhập</th></tr></thead><tbody>{plan.map(row => <tr key={row.line}><td><strong>{row.name}</strong><small>{row.productId ? 'Hàng đã có' : 'Tạo hàng mới'}{row.priceDifferent ? ' · Giữ giá bán trong kho' : ''}</small></td><td>{formatCurrency(row.price)} / {row.stockUnit}</td><td>{row.before} {row.stockUnit}</td><td className="text-green">+{row.quantity} {row.unit}</td><td><strong>{row.after} {row.stockUnit}</strong></td></tr>)}</tbody></table></div>
            <div className="csv-actions"><p>Hãy kiểm tra tên, đơn vị và số lượng trước khi xác nhận.</p><button className="button primary" onClick={() => setConfirm(true)}><Check size={20}/> Nhập {plan.length} mặt hàng vào kho</button></div>
        </section>}
        {confirm && <Confirm title="Xác nhận nhập hàng từ CSV" onClose={() => setConfirm(false)} label="Đúng, nhập vào kho" onConfirm={() => {
            const count = importProducts(rows);
            setSuccess(`Đã nhập ${count} mặt hàng từ ${filename}. Lịch sử nhập hàng đã được lưu.`);
            setRows([]); setFilename(''); setConfirm(false); if (input.current) input.current.value = '';
        }}><p>Nhập <b>{plan.length} mặt hàng</b> từ file <b>{filename}</b>?</p><p>{existingCount} hàng được cộng thêm và {plan.length - existingCount} hàng được tạo mới. Tổng số lượng: {totalQuantity.toLocaleString('vi-VN')} theo các đơn vị trong file.</p></Confirm>}
    </>;
}
