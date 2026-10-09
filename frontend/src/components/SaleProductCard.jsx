import { memo, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { Stepper } from './ui';
import { ProductSymbol } from './ProductSymbol';
import { formatCurrency } from '../utils/formatters';
import { cartKey, baseQuantity, formatKgFromGrams, isWeightUnit, isWeightedProduct, saleOptions } from '../utils/productPricing';

const quickWeights = [{ value: '0.1', label: '1 lạng' }, { value: '0.5', label: '0,5 kg' }, { value: '1', label: '1 kg' }, { value: '2', label: '2 kg' }];
function WeightPicker({ name, grams, stock, option, onChange }) {
    const [draft, setDraft] = useState(grams ? String(grams / option.factor) : '');
    const [error, setError] = useState('');
    const weights = option.unit === 'kg' ? quickWeights : option.unit === 'gram' ? [{ value: '100', label: '100 g' },
        { value: '500', label: '500 g' }, { value: '1000', label: '1 kg' }, { value: '2000', label: '2 kg' }] : [{ value: '1', label: '1 lạng' },
        { value: '5', label: '5 lạng' }, { value: '10', label: '1 kg' }, { value: '20', label: '2 kg' }];
    function commit(raw = draft) {
        const value = String(raw).trim().replace(',', '.').replace(/\.$/, '');
        if (!value) { onChange(0); setDraft(''); setError(''); return; }
        try {
            const next = baseQuantity(value, option.factor);
            if (!next || next > stock) throw new Error(`Chọn từ ${1 / option.factor} ${option.unit} đến ${formatKgFromGrams(stock)}.`);
            onChange(value);
            setDraft(String(next / option.factor));
            setError('');
        } catch (cause) { setError(cause.message); }
    }
    function changeDraft(raw) {
        setDraft(raw);
        setError('');
        const normalized = raw.trim().replace(',', '.');
        if (!normalized) { onChange(0); return; }
        if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) return;
        try { if (baseQuantity(normalized, option.factor) <= stock) onChange(normalized); } catch { /* Keep unfinished input until blur. */ }
    }
    return <div className="fruit-weight-picker">
        <div className="fruit-weight-presets" aria-label={`Chọn nhanh trọng lượng ${name}`}>{weights.map(weight => <button className="button secondary" type="button" key={weight.value} disabled={baseQuantity(weight.value, option.factor) > stock} onClick={() => commit(weight.value)}>{weight.label}</button>)}</div>
        <label className="field">Trọng lượng khách mua ({option.unit})<input type="text" inputMode="decimal" value={draft} disabled={!stock} onChange={event => changeDraft(event.target.value)} onBlur={() => commit()} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur(); } }} placeholder="Ví dụ: 1,35" aria-label={`Trọng lượng ${name} theo ${option.unit}`}/></label>
        {error && <small className="error" role="alert">{error}</small>}
        {grams > 0 && <p className="unit-cart-note">Đã chọn {formatKgFromGrams(grams)}</p>}
    </div>;
}

const SaleProductCard = memo(function SaleProductCard({ product: p, customerId }) {
    const [unitChoice, setUnitChoice] = useState('base');
    const options = useMemo(() => saleOptions(p), [p]);
    const quantities = useActiveShopStore(useShallow(s => {
        const cart = customerId ? s.debtCarts[customerId] : s.cart;
        return options.map(o => cart?.[cartKey(p.id, o.key)] || 0);
    }));
    const setQuantity = useActiveShopStore(s => s.setQuantity);
    if (isWeightedProduct(p)) {
        const option = options.find(row => row.key === unitChoice) || options.find(row => row.unit === 'kg') || options[0];
        const index = options.indexOf(option);
        const grams = quantities[index];
        const other = quantities.reduce((sum, value, position) => sum + (position === index ? 0 : value), 0);
        const available = Math.max(0, p.stock - other);
        const key = cartKey(p.id, option.key);
        return <article className={`product-card ${p.stock === 0 ? 'sold-out' : ''} ${grams ? 'is-in-cart' : ''}`}>
            <div className="product-card-top"><ProductSymbol category={p.category}/><span className={`stock-pill ${p.stock === 0 ? 'out' : p.stock <= (p.lowStockThreshold ?? (p.pricing.group === 'fruit' ? 5000 : 500)) ? 'low' : ''}`}>{p.stock === 0 ? 'Hết hàng' : `Còn ${formatKgFromGrams(p.stock)}`}</span></div>
            <h3>{p.name}</h3>{options.length > 1 && <div className="sale-unit-tabs" role="group" aria-label={`Đơn vị cân ${p.name}`}>
                {options.map(row => <button type="button" key={row.key} className={`sale-unit-tab ${option.key === row.key ? 'active' : ''}`} aria-pressed={option.key === row.key} onClick={() => setUnitChoice(row.key)}>{row.unit}</button>)}</div>}
            <p className="product-price">{formatCurrency(option.price)}<span> / {option.unit}</span></p>
            {isWeightUnit(option.unit) ? <WeightPicker key={option.key} name={p.name} grams={grams} stock={available} option={option} onChange={value => setQuantity(key, value, customerId)}/>
                : <Stepper value={grams / option.factor} min={0} max={Math.floor(available / option.factor)} label={`${p.name} (${option.unit})`} onChange={value => setQuantity(key, value, customerId)}/>}
            {other > 0 && <p className="unit-cart-note">Đã chọn thêm {formatKgFromGrams(other)} ở đơn vị khác.</p>}
        </article>;
    }
    const option = options.find(o => o.key === unitChoice) || options[0];
    const index = options.indexOf(option);
    const key = cartKey(p.id, option.key);
    const used = options.reduce((sum, o, i) => sum + (i === index ? 0 : quantities[i] * o.factor), 0);
    const available = Math.max(0, Math.floor((p.stock - used) / option.factor));
    return <article className={`product-card ${p.stock === 0 ? 'sold-out' : ''} ${quantities.some(q => q > 0) ? 'is-in-cart' : ''}`}>
        <div className="product-card-top"><ProductSymbol category={p.category}/><span className={`stock-pill ${p.stock === 0 ? 'out' : p.stock <= (p.lowStockThreshold ?? 5) ? 'low' : ''}`}>{p.stock === 0 ? 'Hết hàng' : `Còn ${p.stock} ${p.unit}`}</span></div><h3>{p.name}</h3>
        {options.length > 1 && (
            <div className="sale-unit-tabs" role="group" aria-label={`Chọn đơn vị bán ${p.name}`}>
                {options.map(o => (
                    <button
                        type="button"
                        key={o.key}
                        className={`sale-unit-tab ${option.key === o.key ? 'active' : ''}`}
                        onClick={() => setUnitChoice(o.key)}
                        aria-pressed={option.key === o.key}
                    >
                        <span>{o.unit}</span>
                        {o.factor > 1 && <small>({o.factor} {p.unit})</small>}
                    </button>
                ))}
            </div>
        )}
        <p className="product-price">{formatCurrency(option.price)}<span> / {option.unit}</span></p>
        {quantities[index] ? <Stepper value={quantities[index]} max={available} label={`${p.name} (${option.unit})`} onChange={q => setQuantity(key, q, customerId)}/> : <button className="button add-button" disabled={available === 0} onClick={() => setQuantity(key, 1, customerId)}><Plus size={18}/>{p.stock === 0 ? 'Đã hết hàng' : available === 0 ? `Không đủ 1 ${option.unit}` : `Thêm ${option.unit}`}</button>}
        {options.length > 1 && <p className="unit-cart-note">{options.map((o, i) => `${quantities[i]} ${o.unit}`).join(' + ')} đã chọn</p>}
    </article>;
});

export const SaleProductGrid = memo(function SaleProductGrid({ products, customerId }) {
    return <div className="products-grid">{products.map(product => <SaleProductCard key={product.id} product={product} customerId={customerId}/>)}</div>;
});
