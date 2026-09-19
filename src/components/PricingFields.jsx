import { BASIC_UNITS, PRODUCT_GROUPS } from '../utils/productPricing';
import { formatCurrency } from '../utils/formatters';

export function MoneyField({ label, value, onChange, required = true }) {
    return <label className="field">{label}{required && <span> *</span>}<div className="input-unit"><input type="number" min="0" max="999999999" step="1" inputMode="numeric" required={required} value={value} onChange={e => onChange(e.target.value)} placeholder="Nhập số tiền"/><span>đ</span></div>{value !== '' && <small>{formatCurrency(Number(value))}</small>}</label>;
}
export function PricingFields({ draft, onChange, onGroupChange, showGroup = true }) {
    const update = (key, value) => onChange({ ...draft, [key]: value });
    const group = draft.group;
    const unit = group === 'seeds' ? 'lạng' : group === 'beer' ? 'lon' : group === 'tobacco' ? 'gói' : draft.retailUnit;
    const pack = group === 'tobacco' ? 'cây' : group === 'seeds' ? 'kg' : 'thùng';
    const numberField = (key, label) => <label className="field">{label} <span>*</span><input type="number" min="1" max="100000" step="1" inputMode="numeric" value={draft[key]} required placeholder="Nhập theo quy cách của mặt hàng" onChange={e => update(key, e.target.value)}/></label>;
    return <>
        {showGroup && <label className="field">Nhóm hàng<select value={group} onChange={e => onGroupChange(e.target.value)}>{PRODUCT_GROUPS.map(g => <option value={g.id} key={g.id}>{g.label}</option>)}<option value="other">Hàng khác / đơn vị cũ</option></select></label>}
        {['drinks', 'snacks', 'spices', 'other'].includes(group) && <label className="field">{group === 'drinks' ? 'Loại nước' : 'Đơn vị bán lẻ'}<select value={draft.retailUnit} onChange={e => update('retailUnit', e.target.value)}>{(group === 'drinks' ? ['lon', 'chai'] : group === 'snacks' ? ['bịch', 'gói', 'cái', 'viên'] : BASIC_UNITS).map(u => <option key={u} value={u}>{group === 'drinks' ? `Nước ${u}` : u}</option>)}</select></label>}
        {group === 'snacks' && <div className="pricing-conversion">{numberField('bagsPerPack', 'Số bịch trong 1 thùng')}{unit !== 'bịch' && numberField('unitsPerBag', `Số ${unit} trong 1 bịch`)}</div>}
        {['drinks', 'beer', 'tobacco'].includes(group) && <div className="pricing-conversion">{numberField('packSize', `Số ${unit} trong 1 ${pack}`)}</div>}
        {group === 'seeds' && <div className="info-box">1 kg = 10 lạng. Mỗi lạng = 100 g.</div>}
        <div className="pricing-section"><h3>Giá nhập hàng</h3>{group === 'other' ? <p className="muted">Chọn nhóm hàng phía trên để khai báo giá nhập và quy đổi.</p> : group === 'spices' ? <MoneyField label={`Giá nhập 1 ${unit}`} value={draft.purchasePrice} onChange={value => update('purchasePrice', value)}/> : <><MoneyField label={`Giá nhập 1 ${pack}`} value={draft.purchasePackPrice} onChange={value => update('purchasePackPrice', value)}/>{group === 'snacks' && <MoneyField label="Giá nhập 1 bịch" value={draft.purchaseBagPrice} onChange={value => update('purchaseBagPrice', value)}/>}</>}</div>
        <div className="pricing-section"><h3>Giá bán hàng</h3>{['drinks', 'beer', 'tobacco'].includes(group) && <MoneyField label={`Giá bán 1 ${pack}`} value={draft.retailPackPrice} onChange={value => update('retailPackPrice', value)}/>}<MoneyField label={`Giá bán lẻ 1 ${unit}`} value={draft.retailPrice} onChange={value => update('retailPrice', value)}/></div>
    </>;
}
