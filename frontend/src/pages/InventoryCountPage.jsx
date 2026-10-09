import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccountStore } from '../stores/useAccountStore';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { useCloudShopStore } from '../stores/useCloudShopStore';
import { useProductSearch } from '../hooks/useProductSearch';
import { useListWindow } from '../hooks/useListWindow';
import { ListMore } from '../components/ListMore';
import { Confirm, Notice, PageHeading, SearchBox } from '../components/ui';
import { stockDescription } from '../utils/productPricing';

export function InventoryCountPage() {
    const store = useAccountStore(state => state.store);
    const mode = useAccountStore(state => state.dataMode);
    const products = useActiveShopStore(state => state.products);
    const countStock = useActiveShopStore(state => state.countStock);
    const [query, setQuery] = useState('');
    const [counted, setCounted] = useState({});
    const [note, setNote] = useState('');
    const [pending, setPending] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const { found, deferredQuery } = useProductSearch(products, query);
    const { visible, showMore, hasMore } = useListWindow(found, deferredQuery);
    if (mode !== 'supabase' || store.role !== 'owner') return <><PageHeading title="Kiểm kê kho" back="/inventory"/><p>Kiểm kê DB dành cho chủ cửa hàng đang dùng Supabase.</p><Link className="button secondary" to="/inventory">Về kho</Link></>;
    function change(product, field, value) {
        setCounted(current => ({ ...current, [product.id]: {
            expectedVersion: product.version, systemStock: product.stock,
            ...current[product.id], [field]: value,
        } }));
    }
    function review(event) {
        event.preventDefault(); setError('');
        try {
            const items = Object.entries(counted).filter(([, row]) => row.quantity !== '' && row.quantity !== undefined)
                .map(([productId, row]) => {
                    const actualBase = Number(row.quantity);
                    if (!Number.isSafeInteger(actualBase) || actualBase < 0) throw new Error('Tồn thực tế phải là số nguyên không âm theo đơn vị nhỏ nhất.');
                    if (actualBase !== row.systemStock && !row.reason?.trim()) throw new Error('Hãy ghi lý do cho từng mặt hàng có chênh lệch.');
                    return { productId, actualBase, reason: row.reason || '', expectedVersion: row.expectedVersion };
                });
            if (!items.length || items.length > 500) throw new Error('Mỗi phiếu kiểm kê cần từ 1 đến 500 mặt hàng.');
            setPending(items);
        } catch (cause) { setError(cause.message); }
    }
    return <><PageHeading title="Kiểm kê kho" description="Đếm số hàng thực tế. Chỉ mặt hàng đã nhập số lượng mới được ghi vào phiếu." back="/inventory"/>
        {success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}
        <form className="panel form-panel" onSubmit={review}>
            <p className="info-box">Đếm theo đơn vị tồn ghi bên cạnh tên hàng. Hàng cân đếm gram (1 kg = 1.000 gram); hàng theo quả/hộp đếm số nguyên. Nếu kho có giao dịch mới trong lúc đếm, DB sẽ yêu cầu kiểm tra lại.</p>
            <SearchBox value={query} onChange={setQuery}/>
            <button type="button" className="button secondary" disabled={refreshing} onClick={async () => {
                setRefreshing(true); setError('');
                try { await useCloudShopStore.getState().load(store.id); setCounted({}); setPending(null); }
                catch (cause) { setError(cause.message); }
                finally { setRefreshing(false); }
            }}>{refreshing ? 'Đang tải…' : 'Tải lại tồn để đếm lại'}</button>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Mặt hàng</th><th>Trong hệ thống</th><th>Đếm thực tế</th><th>Lý do chênh lệch</th></tr></thead>
                <tbody>{visible.map(product => <tr key={product.id}><td>{product.name}<small> · {product.unit}</small></td><td>{stockDescription(product)}</td>
                    <td><input aria-label={`Tồn thực tế ${product.name}`} type="number" min="0" step="1" value={counted[product.id]?.quantity ?? ''} onChange={event => change(product, 'quantity', event.target.value)}/></td>
                    <td><input aria-label={`Lý do ${product.name}`} maxLength={300} value={counted[product.id]?.reason ?? ''} onChange={event => change(product, 'reason', event.target.value)} placeholder="Nếu có chênh lệch"/></td></tr>)}</tbody></table></div>
            <ListMore shown={visible.length} total={found.length} hasMore={hasMore} onMore={showMore}/>
            <label className="field">Ghi chú phiếu<textarea maxLength={500} rows={2} value={note} onChange={event => setNote(event.target.value)}/></label>
            {error && <p className="error" role="alert">{error}</p>}<button className="button primary">Xem xác nhận kiểm kê</button>
        </form>
        {pending && <Confirm title="Chốt phiếu kiểm kê?" label="Lưu kiểm kê vào DB" onClose={() => setPending(null)} onConfirm={async () => {
            const result = await countStock(pending, note);
            setCounted({}); setNote(''); setPending(null);
            setSuccess(`Đã lưu phiếu kiểm kê ${pending.length} mặt hàng${result.changed_products !== undefined ? `; ${result.changed_products} mặt hàng được điều chỉnh` : ''}.`);
        }}><p>Ghi tồn thực tế cho {pending.length} mặt hàng. DB tự tính chênh lệch, lưu lịch sử và giá trị hao hụt.</p><p>{note || 'Không có ghi chú thêm.'}</p></Confirm>}
    </>;
}
