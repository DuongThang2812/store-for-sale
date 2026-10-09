import { BASIC_UNITS, FRUIT_COUNT_UNITS, PRODUCT_GROUPS, SNACK_UNITS } from '../utils/productPricing';
import { formatCurrency } from '../utils/formatters';

export function MoneyField({ label, value, onChange, required = true }) {
    return <label className="field">{label}{required && <span> *</span>}<div className="input-unit"><input type="number" min="0" max="999999999" step="1" inputMode="numeric" required={required} value={value} onChange={e => onChange(e.target.value)} placeholder="Nhập số tiền"/><span>đ</span></div>{value !== '' && <small>{formatCurrency(Number(value))}</small>}</label>;
}
export function PricingFields({ draft, onChange, onGroupChange, showGroup = true, groups = PRODUCT_GROUPS }) {
    const update = (key, value) => onChange({ ...draft, [key]: value });
    const group = draft.group;
    const weighedFruit = group === 'fruit' && draft.retailUnit === 'gram';
    const unit = weighedFruit ? 'kg' : group === 'seeds' ? 'lạng' : group === 'beer' ? 'lon' : group === 'tobacco' ? 'gói' : draft.retailUnit;
    const pack = group === 'fruit' ? unit : group === 'tobacco' ? 'cây' : group === 'seeds' ? 'kg' : 'thùng';
    const numberField = (key, label) => <label className="field">{label} <span>*</span><input type="number" min="1" max="100000" step="1" inputMode="numeric" value={draft[key]} required placeholder="Nhập theo quy cách của mặt hàng" onChange={e => update(key, e.target.value)}/></label>;
    return <>
        {showGroup && <label className="field">Nhóm hàng<select value={group} onChange={e => onGroupChange(e.target.value)}>{groups.map(g => <option value={g.id} key={g.id}>{g.label}</option>)}<option value="other">Hàng khác / đơn vị cũ</option></select></label>}
        {group === 'fruit' && <label className="field">Cách bán trái cây<select value={draft.retailUnit} onChange={event => onChange({ ...draft, retailUnit: event.target.value,
            fruitPackUnit: draft.fruitPackUnit === event.target.value ? FRUIT_COUNT_UNITS.find(value => value !== event.target.value) : draft.fruitPackUnit })}>
            <option value="gram">Cân theo kg</option>{FRUIT_COUNT_UNITS.map(value => <option key={value} value={value}>Theo {value}</option>)}</select>
            <small>Hàng đã có tồn hoặc lịch sử cần giữ đơn vị cũ. Tạo mặt hàng mới nếu đổi cách bán.</small></label>}
        {['drinks', 'snacks', 'spices', 'other'].includes(group) && <label className="field">{group === 'drinks' ? 'Loại nước' : 'Đơn vị bán lẻ'}<select value={draft.retailUnit} onChange={e => update('retailUnit', e.target.value)}>{(group === 'drinks' ? ['lon', 'chai'] : group === 'snacks' ? ['bịch', 'gói', 'cái', 'viên'] : BASIC_UNITS).map(u => <option key={u} value={u}>{group === 'drinks' ? `Nước ${u}` : u}</option>)}</select></label>}
        {group === 'snacks' && <div className="pricing-conversion">{numberField('bagsPerPack', 'Số bịch trong 1 thùng')}{unit !== 'bịch' && numberField('unitsPerBag', `Số ${unit} trong 1 bịch`)}</div>}
        {['drinks', 'beer', 'tobacco'].includes(group) && <div className="pricing-conversion">{numberField('packSize', `Số ${unit} trong 1 ${pack}`)}</div>}
        {group === 'seeds' && <div className="info-box">1 kg = 10 lạng. Mỗi lạng = 100 g. {draft.baseUnit === 'lạng' ? 'Hàng cũ giữ tồn theo lạng.' : 'Kho theo gram; có thể bán lẻ đến 1 gram.'}</div>}
        {weighedFruit && <div className="info-box">Nhập và bán theo kg, có thể cân lẻ đến 1 gram. Kho tự theo dõi bằng gam để không lệch số lượng.</div>}
        {group === 'fruit' && !weighedFruit && <div className="info-box">Kho đếm từng {unit}. Nhập giá cho 1 {unit}; không cần khai báo quy đổi nếu chỉ bán đơn vị này.</div>}
        <div className="pricing-section"><h3>Giá nhập hàng</h3>{group === 'other' ? <p className="muted">Chọn nhóm hàng phía trên để khai báo giá nhập và quy đổi.</p> : group === 'spices' ? <MoneyField label={`Giá nhập 1 ${unit}`} value={draft.purchasePrice} onChange={value => update('purchasePrice', value)}/> : <><MoneyField label={`Giá nhập 1 ${pack}`} value={draft.purchasePackPrice} onChange={value => update('purchasePackPrice', value)}/>{group === 'snacks' && <MoneyField label="Giá nhập 1 bịch" value={draft.purchaseBagPrice} onChange={value => update('purchaseBagPrice', value)}/>}</>}</div>
        <div className="pricing-section"><h3>Giá bán hàng</h3>{['drinks', 'beer', 'tobacco'].includes(group) && <MoneyField label={`Giá bán 1 ${pack}`} value={draft.retailPackPrice} onChange={value => update('retailPackPrice', value)}/>}<MoneyField label={`Giá bán lẻ 1 ${unit}`} value={draft.retailPrice} onChange={value => update('retailPrice', value)}/>
            {group === 'seeds' && draft.baseUnit !== 'lạng' && <><MoneyField label="Giá bán 1 kg" required={false} value={draft.retailPackPrice} onChange={value => update('retailPackPrice', value)}/><small>Bỏ trống: giá 1 kg bằng 10 lần giá 1 lạng. Giá đã chọn sẽ hiện trong phần Bán hàng.</small></>}
        </div>
        {group === 'fruit' && <FruitExtraUnits draft={draft} onChange={onChange}/>}
        {group === 'snacks' && <SnackExtraUnits draft={draft} onChange={onChange}/>}
    </>;
}

function SnackExtraUnits({ draft, onChange }) {
    const extras = draft.additionalUnits || [];
    const update = (key, value) => onChange({ ...draft, [key]: value });
    const available = SNACK_UNITS.filter(unit => ![draft.retailUnit, 'bịch', 'thùng', ...extras.map(row => row.unit)].includes(unit));
    const changeUnit = (key, patch) => update('additionalUnits', extras.map(unit => unit.key === key ? { ...unit, ...patch } : unit));
    function addUnit() {
        const keys = new Set(extras.map(unit => unit.key));
        let index = 1;
        while (keys.has(`extra_${index}`)) index += 1;
        update('additionalUnits', [...extras, { key: `extra_${index}`, unit: available[0], factor: '',
            canPurchase: false, canSell: true, purchasePrice: '', salePrice: '' }]);
    }
    return <div className="pricing-section"><h3>Bán nguyên bịch, thùng hoặc đơn vị khác (nếu có)</h3>
        <MoneyField label="Giá bán 1 thùng" required={false} value={draft.retailPackPrice} onChange={value => update('retailPackPrice', value)}/>
        {draft.retailUnit !== 'bịch' && <MoneyField label="Giá bán 1 bịch" required={false} value={draft.retailBagPrice} onChange={value => update('retailBagPrice', value)}/>}
        {draft.retailUnit !== 'bịch' && <MoneyField label={`Giá nhập 1 ${draft.retailUnit} (nếu nhập lẻ)`} required={false} value={draft.purchaseRetailPrice} onChange={value => update('purchaseRetailPrice', value)}/>}
        <small>Bỏ trống giá bán để không bán đơn vị đó. Mỗi đơn vị có giá riêng và dùng chung số tồn.</small>
        {extras.map(unit => <fieldset className="pricing-section" key={unit.key}><legend>Đơn vị thêm: {unit.unit}</legend>
            <label className="field">Đơn vị<select value={unit.unit} onChange={event => changeUnit(unit.key, { unit: event.target.value })}>
                {[unit.unit, ...available].map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label className="field">Số {draft.retailUnit} trong 1 {unit.unit}<input required type="number" min="1" max="100000" step="1" value={unit.factor} onChange={event => changeUnit(unit.key, { factor: event.target.value })}/></label>
            <label className="field"><span><input type="checkbox" checked={unit.canPurchase} onChange={event => changeUnit(unit.key, { canPurchase: event.target.checked })}/> Nhập theo {unit.unit}</span></label>
            {unit.canPurchase && <MoneyField label={`Giá nhập 1 ${unit.unit}`} value={unit.purchasePrice} onChange={value => changeUnit(unit.key, { purchasePrice: value })}/>}
            <label className="field"><span><input type="checkbox" checked={unit.canSell} onChange={event => changeUnit(unit.key, { canSell: event.target.checked })}/> Bán theo {unit.unit}</span></label>
            {unit.canSell && <MoneyField label={`Giá bán 1 ${unit.unit}`} value={unit.salePrice} onChange={value => changeUnit(unit.key, { salePrice: value })}/>}
            <button type="button" className="button secondary" onClick={() => update('additionalUnits', extras.filter(row => row.key !== unit.key))}>Bỏ đơn vị {unit.unit}</button>
        </fieldset>)}
        {available.length > 0 && <button type="button" className="button secondary" onClick={addUnit}>Thêm đơn vị đóng gói</button>}
        <small>Ví dụ kho theo viên: 1 gói = 20 viên, 1 bịch = 200 viên, 1 thùng = 4.000 viên. Hàng đã có tồn hoặc đang trong giỏ cần giữ quy cách cũ.</small>
    </div>;
}

function FruitExtraUnits({ draft, onChange }) {
    const update = (key, value) => onChange({ ...draft, [key]: value });
    return <div className="pricing-section"><h3>Đơn vị bán thêm (nếu có)</h3>
        {draft.retailUnit === 'gram' && <><MoneyField label="Giá bán 1 lạng" required={false} value={draft.retailLangPrice} onChange={value => update('retailLangPrice', value)}/>
            <MoneyField label="Giá bán 1 gram" required={false} value={draft.retailGramPrice} onChange={value => update('retailGramPrice', value)}/>
            <small>Bỏ trống để chỉ bán theo kg. Điền giá nếu muốn chọn thêm lạng hoặc gram khi bán.</small></>}
        <label className="field"><span><input type="checkbox" checked={draft.fruitPackEnabled} onChange={event => update('fruitPackEnabled', event.target.checked)}/> Có bán hoặc nhập thêm theo hộp, khay, túi, thùng</span></label>
        {draft.fruitPackEnabled && <><label className="field">Đơn vị đóng gói<select value={draft.fruitPackUnit} onChange={event => update('fruitPackUnit', event.target.value)}>
            {FRUIT_COUNT_UNITS.filter(unit => unit !== draft.retailUnit).map(unit => <option key={unit} value={unit}>{unit}</option>)}</select></label>
            <label className="field">Số {draft.retailUnit} trong 1 {draft.fruitPackUnit}<input type="number" required min="1" max="100000" step="1" value={draft.fruitPackFactor} onChange={event => update('fruitPackFactor', event.target.value)}/></label>
            <label className="field"><span><input type="checkbox" checked={draft.fruitPackCanPurchase} onChange={event => update('fruitPackCanPurchase', event.target.checked)}/> Nhập theo đơn vị này</span></label>
            {draft.fruitPackCanPurchase && <MoneyField label={`Giá nhập 1 ${draft.fruitPackUnit}`} value={draft.fruitPackPurchasePrice} onChange={value => update('fruitPackPurchasePrice', value)}/>}
            <label className="field"><span><input type="checkbox" checked={draft.fruitPackCanSell} onChange={event => update('fruitPackCanSell', event.target.checked)}/> Bán theo đơn vị này</span></label>
            {draft.fruitPackCanSell && <MoneyField label={`Giá bán 1 ${draft.fruitPackUnit}`} value={draft.fruitPackSalePrice} onChange={value => update('fruitPackSalePrice', value)}/>}
            <small>Ví dụ: hộp 500 gram hoặc thùng 12 quả. Mỗi đơn vị dùng chung số tồn và có giá riêng.</small></>}
    </div>;
}
