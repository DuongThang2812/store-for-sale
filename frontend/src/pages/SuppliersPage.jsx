import { useEffect, useState } from 'react';
import { MapPin, Phone, Truck } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { supplierService } from '../services/supplierService.js';
import { Empty, Notice, PageHeading } from '../components/ui.jsx';
import { StaggerContainer, StaggerItem } from '../components/motion/MotionPrimitives.jsx';

export function SuppliersPage() {
    const store = useAccountStore(state => state.store);
    const [result, setResult] = useState({ storeId: null, rows: [] });
    const [draft, setDraft] = useState({ name: '', phone: '', address: '', note: '' });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const loading = result.storeId !== store.id;
    const rows = loading ? [] : result.rows;

    useEffect(() => {
        let active = true;
        supplierService.list(store.id, { limit: 200 })
            .then(rows => { if (active) setResult({ storeId: store.id, rows }); })
            .catch(() => { if (active) { setResult({ storeId: store.id, rows: [] }); setError('Chưa tải được nhà cung cấp. Vui lòng thử lại.'); } });
        return () => { active = false; };
    }, [store.id]);

    async function submit(event) {
        event.preventDefault();
        if (busy || store.role !== 'owner') return;
        setBusy(true); setError(''); setSuccess('');
        try {
            await supplierService.save(store.id, draft);
            setDraft({ name: '', phone: '', address: '', note: '' });
            setResult({ storeId: store.id, rows: await supplierService.list(store.id, { limit: 200 }) });
            setSuccess('Đã lưu nhà cung cấp.');
        } catch { setError('Chưa lưu được nhà cung cấp. Vui lòng kiểm tra thông tin và thử lại.'); }
        finally { setBusy(false); }
    }
    const field = (key, label, maxLength, placeholder) => <label className="field" key={key}>{label}<input maxLength={maxLength} required={key === 'name'} placeholder={placeholder} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}/></label>;
    return <><PageHeading title="Nhà cung cấp" description="Ghi lại nơi nhập hàng để dễ đối chiếu giá và từng lô hàng."/>
        {success && <Notice>{success}</Notice>}{error && <p className="error" role="alert">{error}</p>}
        <StaggerContainer className="settings-stack">
            {store.role === 'owner' && <StaggerItem as="section" className="panel master-data-editor"><h2><Truck size={22}/> Thêm nhà cung cấp</h2><form onSubmit={submit}>
                {field('name', 'Tên nhà cung cấp', 120, 'Ví dụ: Đại lý Minh Phát')}{field('phone', 'Số điện thoại', 30, 'Ví dụ: 0909 123 456')}
                {field('address', 'Địa chỉ', 300, 'Chợ đầu mối / địa chỉ kho')}{field('note', 'Ghi chú', 500, 'Mặt hàng chính, lịch giao hàng...')}
                <button className="button primary" disabled={busy || !draft.name.trim()}>{busy ? 'Đang lưu…' : 'Lưu nhà cung cấp'}</button>
            </form></StaggerItem>}
            <StaggerItem as="section" className="panel master-data-list"><h2><Truck size={22}/> Danh sách của {store.name}</h2>{loading ? <p role="status">Đang tải nhà cung cấp…</p> : rows.length ? <ul>{rows.map(row => <li key={row.id}><strong>{row.name}</strong>{row.phone && <span><Phone size={14}/> {row.phone}</span>}{row.address && <small><MapPin size={14}/> {row.address}</small>}</li>)}</ul> : <Empty icon={Truck} title="Chưa có nhà cung cấp nào" text="Lưu nhà cung cấp giúp đối chiếu nguồn hàng và giá nhập nhanh hơn."/>}</StaggerItem>
        </StaggerContainer>
    </>;
}
