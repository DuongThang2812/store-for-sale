import { useEffect, useState } from 'react';
import { FolderPlus, Tag } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { categoryService } from '../services/categoryService.js';
import { PageHeading } from '../components/ui.jsx';

export function CategoriesPage() {
    const store = useAccountStore(s => s.store);
    const [result, setResult] = useState({ storeId: null, rows: [] });
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const loading = result.storeId !== store.id;
    const rows = loading ? [] : result.rows;
    useEffect(() => {
        let active = true;
        categoryService.list(store.id)
            .then(rows => { if (active) setResult({ storeId: store.id, rows }); })
            .catch(() => { if (active) { setResult({ storeId: store.id, rows: [] }); setError('Chưa tải được danh mục. Vui lòng thử lại.'); } });
        return () => { active = false; };
    }, [store.id]);
    async function submit(event) {
        event.preventDefault();
        if (busy || store.role !== 'owner') return;
        setBusy(true); setError(''); setSuccess('');
        try { await categoryService.save(store.id, name); setName(''); setResult({ storeId: store.id, rows: await categoryService.list(store.id) }); setSuccess('Đã tạo danh mục.'); }
        catch { setError('Chưa lưu được danh mục. Tên có thể đã tồn tại.'); }
        finally { setBusy(false); }
    }
    return <><PageHeading title="Danh mục hàng" description="Đặt tên nhóm hàng phù hợp với cửa hàng của bạn."/>
        {store.role === 'owner' && <section className="panel category-editor"><h2><FolderPlus size={22}/> Thêm danh mục</h2><form onSubmit={submit}><label className="field">Tên danh mục<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder={store.businessType === 'fruit_shop' ? 'Ví dụ: Trái cây nhập khẩu' : 'Ví dụ: Gia vị'}/></label><button className="button primary" disabled={busy || !name.trim()}>{busy ? 'Đang lưu…' : 'Thêm danh mục'}</button></form></section>}
        {success && <p className="info-box" role="status">{success}</p>}{error && <p className="error" role="alert">{error}</p>}
        <section className="panel category-list"><h2><Tag size={22}/> Danh mục của {store.name}</h2>{loading ? <p role="status">Đang tải danh mục…</p> : rows.length ? <ul>{rows.map(row => <li key={row.id}>{row.name}{!row.is_active && <small>Đã ẩn</small>}</li>)}</ul> : <p>Chưa có danh mục nào. Chủ tiệm có thể thêm nhóm hàng riêng.</p>}</section>
    </>;
}
