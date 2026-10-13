import { useEffect, useState } from 'react';
import { Check, CloudUpload } from 'lucide-react';
import { Confirm } from './ui';
import { useAccountStore } from '../stores/useAccountStore.js';
import { useCloudShopStore } from '../stores/useCloudShopStore.js';
import { createSupabaseShopRepository } from '../repositories/supabaseShopRepository.js';
import { formatCurrency } from '../utils/formatters.js';

export function CloudCatalogImport({ records, filename, requestId }) {
    const store = useAccountStore(s => s.store);
    const [quotes, setQuotes] = useState([]);
    const [hasMoreQuotes, setHasMoreQuotes] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState('');
    const [savedImport, setSavedImport] = useState(null);
    const result = savedImport?.requestId === requestId && savedImport.storeId === store.id ? savedImport.result : null;

    useEffect(() => {
        let live = true;
        createSupabaseShopRepository({ storeId: store.id }).listSourceQuotes({ limit: 30 })
            .then(rows => { if (live) { setQuotes(rows); setHasMoreQuotes(rows.length === 30); } })
            .catch(() => { if (live) setError('Chưa tải được danh mục trên DB. Vui lòng thử lại sau.'); });
        return () => { live = false; };
    }, [store.id]);

    async function importFile() {
        setBusy(true); setError('');
        try {
            const repository = createSupabaseShopRepository({ storeId: store.id });
            const response = await repository.commands.importCatalogDrafts(requestId, records);
            setSavedImport({ requestId, storeId: store.id, result: response });
            setConfirm(false);
            try {
                const [rows] = await Promise.all([
                    repository.listSourceQuotes({ limit: 30 }),
                    useCloudShopStore.getState().load(store.id),
                ]);
                setQuotes(rows); setHasMoreQuotes(rows.length === 30);
            } catch { setError('Đã lưu vào DB, nhưng chưa tải lại được danh sách. Hãy tải lại trang.'); }
        } catch { setError('Chưa lưu được danh mục. Vui lòng kiểm tra kết nối và thử lại.'); setConfirm(false); }
        finally { setBusy(false); }
    }

    return <section className="panel csv-preview">
        <div className="panel-heading"><div><h2><CloudUpload size={22}/> Lưu danh mục vào Supabase DB</h2><p>Cửa hàng: {store.name}</p></div><span className="stock-pill">DB</span></div>
        <div className="info-box">Danh mục kho sẽ cập nhật từ DB sau khi nhập. Hàng mới ngừng bán, tồn kho 0 cho đến khi bạn hoàn thiện giá và quy cách.</div>
        {records.length > 0 && !result && <div className="csv-actions"><p>{store.role === 'owner' ? `${records.length} dòng giá nguồn sẽ được lưu vào DB của cửa hàng này.` : 'Chỉ chủ tiệm mới được nhập danh mục vào DB.'}</p>{store.role === 'owner' && <button className="button primary" disabled={busy} onClick={() => setConfirm(true)}><Check size={20}/> Lưu {records.length} dòng vào DB</button>}</div>}
        {result && <div className="info-box"><b>Đã lưu vào DB:</b> {result.quoted} dòng giá nguồn, tạo {result.created} mặt hàng mới, ghép {result.matched} hàng đã có, bỏ qua {result.skipped_source} dòng đã nhập trước đó.</div>}
        {quotes.length > 0 && <><h3>Danh mục đã có trên DB</h3><div className="table-scroll"><table className="data-table"><thead><tr><th>Mã nguồn</th><th>Mặt hàng</th><th>Giá nhập tham khảo</th><th>Ghi chú</th></tr></thead><tbody>{quotes.map(quote => <tr key={quote.source_id}><td>{quote.source_id}</td><td>{quote.source_name}</td><td>{quote.reference_cost === null ? 'Chưa rõ' : formatCurrency(Number(quote.reference_cost))}</td><td>{quote.review_note || quote.availability}</td></tr>)}</tbody></table></div><p className="page-hint">Đang hiển thị {quotes.length} dòng từ DB.</p>{hasMoreQuotes && <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const next = await createSupabaseShopRepository({ storeId: store.id }).listSourceQuotes({ offset: quotes.length, limit: 30 }); setQuotes(current => [...current, ...next]); setHasMoreQuotes(next.length === 30); } catch { setError('Chưa tải được danh sách. Vui lòng thử lại.'); } finally { setBusy(false); } }}>Xem thêm hàng trong DB</button>}</>}
        {error && <p className="error" role="alert">{error}</p>}
        {confirm && <Confirm title="Lưu danh mục vào DB?" onClose={() => setConfirm(false)} label="Lưu vào DB" onConfirm={importFile}><p>Ghi <b>{records.length} dòng</b> từ <b>{filename}</b> vào cửa hàng <b>{store.name}</b>?</p><p>Hàng mới sẽ ngừng bán, tồn kho 0. Giá nhập giữ làm dữ liệu nguồn, không tự thành giá bán.</p></Confirm>}
    </section>;
}
