import { useEffect, useState } from 'react';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { useAccountStore } from '../stores/useAccountStore';
import { inventoryService } from '../services/inventoryService';
import { Confirm } from './ui';
import { MoneyField } from './PricingFields';
import { stockDescription } from '../utils/productPricing';

export function StockTools({ product, onDone }) {
    const storeId = useAccountStore(state => state.store.id);
    const [cost, setCost] = useState(null);
    const [error, setError] = useState('');
    const [unitKey, setUnitKey] = useState('');
    const [price, setPrice] = useState('');
    const [loss, setLoss] = useState('');
    const [reason, setReason] = useState('damaged');
    const [note, setNote] = useState('');
    const [confirm, setConfirm] = useState(null);
    const valueStock = useActiveShopStore(state => state.valueOpeningStock);
    const adjustStock = useActiveShopStore(state => state.adjustStock);
    useEffect(() => {
        let active = true;
        void inventoryService.productCost(storeId, product.id)
            .then(row => { if (active) setCost(row); })
            .catch(cause => { if (active) setError(cause.message); });
        return () => { active = false; };
    }, [storeId, product.id, product.stock]);
    const unit = product.units.find(row => row.key === unitKey) || product.units.find(row => row.canPurchase) || product.units[0];
    const lossQuantity = Number(loss);
    return <>
        <section className="panel stock-side"><h2>Giá vốn tồn hiện tại</h2>
            {error && <p className="error" role="alert">{error}</p>}
            {!cost ? <p role="status">Đang đọc giá vốn…</p> : cost.cost_known
                ? <p>Đã có giá vốn bình quân. Lợi nhuận được chốt theo từng lần bán trên DB.</p>
                : product.stock > 0 ? <form onSubmit={event => { event.preventDefault(); if (price === '' || !Number.isSafeInteger(Number(price)) || Number(price) < 0) return; setConfirm('cost'); }}>
                    <p className="muted">Tồn cũ chưa rõ vốn. Nhập giá vốn bạn đã đối chiếu; các đơn bán trước đây giữ nguyên trạng thái chưa rõ vốn.</p>
                    <label className="field">Đơn vị định giá<select value={unit.key} onChange={event => setUnitKey(event.target.value)}>
                        {product.units.map(row => <option value={row.key} key={row.key}>{row.name} · {row.factor} {product.unit}</option>)}</select></label>
                    <MoneyField label={`Giá vốn 1 ${unit.name}`} required value={price} onChange={setPrice}/>
                    <button className="button secondary full">Định giá tồn đầu kỳ</button>
                </form> : <p>Chưa có hàng tồn. Giá vốn sẽ được ghi khi nhập hàng có giá nhập.</p>}
        </section>
        <section className="panel stock-side"><h2>Hao hụt / dùng riêng</h2><p className="muted">Ghi số lượng giảm theo đơn vị nhỏ nhất: {product.unit}.</p>
            <form onSubmit={event => { event.preventDefault(); setConfirm('loss'); }}>
                <label className="field">Số lượng giảm ({product.unit})<input required type="number" min="1" step="1" max={product.stock} value={loss} onChange={event => setLoss(event.target.value)}/></label>
                <label className="field">Lý do<select value={reason} onChange={event => setReason(event.target.value)}>
                    <option value="damaged">Hỏng / dập</option><option value="spoiled">Hết hạn / hư</option><option value="lost">Thất lạc</option><option value="personal_use">Dùng riêng</option><option value="other">Khác</option></select></label>
                <label className="field">Ghi chú<input maxLength={300} value={note} onChange={event => setNote(event.target.value)}/></label>
                <button className="button secondary full" disabled={!Number.isSafeInteger(lossQuantity) || lossQuantity < 1 || lossQuantity > product.stock}>Ghi hao hụt</button>
            </form>
        </section>
        {confirm && <Confirm title={confirm === 'cost' ? 'Chốt giá vốn tồn đầu kỳ?' : 'Ghi giảm hàng trong kho?'}
            label="Xác nhận lưu DB" onClose={() => setConfirm(null)} onConfirm={async () => {
                if (confirm === 'cost') {
                    await valueStock(product.id, unit.key, Number(price));
                    setCost({ cost_known: true });
                } else {
                    await adjustStock(product.id, -lossQuantity, reason, note);
                    setLoss(''); setNote('');
                }
                setConfirm(null); onDone('Đã ghi vào DB và cập nhật tồn kho / giá vốn.');
            }}><p>{product.name} · {stockDescription(product)}</p>
            <p>{confirm === 'cost' ? `Giá vốn ${price} đồng / ${unit.name}. Chỉ được định giá tồn chưa rõ vốn một lần.` : `Giảm ${lossQuantity} ${product.unit}, lý do: ${note || reason}. Lịch sử vẫn được lưu.`}</p></Confirm>}
    </>;
}
