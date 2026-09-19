import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, PackagePlus, Plus, Package, Download, ChevronRight, Check, Cookie, GlassWater, Beer, Wheat, Sprout, Boxes } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { ActivityList, Confirm, Empty, Notice, PageHeading, SearchBox } from '../components/ui';
import { MoneyField, PricingFields } from '../components/PricingFields';
import { matches, exportCsv } from '../utils/shopHelpers';
import { ProductSymbol } from './SalesPages';
import { productCsvRows } from '../utils/stockCsv';
import { formatCurrency } from '../utils/formatters';
import { PRODUCT_GROUPS, createPricingDraft, changePricingGroup, buildPricing, purchaseOptions, saleOptions, baseQuantity, stockDescription, convertedExistingStock } from '../utils/productPricing';

const groupIcons = { snacks: Cookie, drinks: GlassWater, beer: Beer, spices: Sprout, seeds: Wheat, tobacco: Boxes };
export function ImportPage() {
    return <><PageHeading title="Nhập hàng" description="Chọn nhóm hàng để nhập đúng đơn vị và giá bán." action={<Link className="button primary" to="/import/existing"><PackagePlus size={20}/> Nhập thêm hàng đã có</Link>}/>
        <div className="section-heading"><h2>Thêm mặt hàng theo nhóm</h2><span>Mỗi nhóm có quy cách và giá riêng</span></div>
        <div className="import-group-grid">{PRODUCT_GROUPS.map((group, i) => { const Icon = groupIcons[group.id]; return <Link className="panel import-group-card" key={group.id} to={`/import/new?group=${group.id}`}><span className={`choice-icon ${['green', 'blue', 'orange', 'purple'][i % 4]}`}><Icon size={32}/></span><h2>{group.label}</h2><p>{group.description}</p><span className="text-link">Thêm hàng mới <ArrowRight size={17}/></span></Link>; })}</div>
        <div className="import-extra-links"><Link className="button secondary" to="/import/csv"><Download size={20}/> Nhập danh sách từ CSV</Link><Link className="text-link" to="/import/new?group=other">Thêm mặt hàng khác <Plus size={18}/></Link></div>
        <div className="info-box import-tip"><Package size={23}/> Hàng đã có trong tiệm? Chọn “Nhập thêm hàng đã có” để cộng số lượng vào đúng mặt hàng.</div>
    </>;
}
export function ImportExistingPage() {
    const { products, addStock, undoStock } = useShopStore();
    const [params] = useSearchParams();
    const [selected, setSelected] = useState(params.get('product') || '');
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    const [success, setSuccess] = useState('');
    const [undo, setUndo] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(''), 12000); return () => clearTimeout(timer); }, [undo]);
    const product = products.find(p => p.id === selected && p.isActive);
    const shown = products.filter(p => p.isActive && matches(p.name, query) && (group === 'all' || (p.pricing?.group || 'other') === group));
    return <><PageHeading title="Nhập thêm hàng" description="Chọn hàng, đơn vị nhập và giá của lần nhập này." back="/import"/>
        {success && <Notice action={undo && <button className="text-link" onClick={() => { try { undoStock(undo); setSuccess('Đã hoàn tác lần nhập hàng vừa rồi.'); setUndo(''); } catch (e) { setError(e.message); } }}>Hoàn tác</button>} onClose={() => setSuccess('')}>{success}</Notice>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="stock-import-layout"><section className="panel selection-panel"><h2><span className="step-number">1</span> Chọn mặt hàng</h2><SearchBox value={query} onChange={setQuery}/><label className="field">Nhóm hàng<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">Tất cả nhóm hàng</option>{PRODUCT_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}<option value="other">Hàng khác / chưa phân nhóm</option></select></label><div className="selection-list">{shown.map(item => <button className={selected === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)} key={item.id}><ProductSymbol category={item.category}/><span><b>{item.name}</b><small>Hiện còn {stockDescription(item)}</small></span>{selected === item.id ? <Check size={21}/> : <ChevronRight size={20}/>}</button>)}{!shown.length && <Empty title="Không tìm thấy hàng" text="Thử tên khác hoặc chọn nhóm hàng khác."/>}</div></section>
        {product ? <RestockForm key={product.id} product={product} onSave={(quantity, option, cost) => { const entryId = addStock(product.id, quantity, option.key, cost); setSuccess(`Đã nhập ${quantity} ${option.unit} ${product.name}. Trong kho hiện có ${stockDescription(product, product.stock + baseQuantity(quantity, option.factor))}.`); setUndo(entryId); setError(''); }}/> : <section className="panel import-quantity"><Empty title="Chọn hàng ở bước 1" text="Đơn vị, giá nhập và tồn kho sẽ hiện ở đây."/></section>}</div>
    </>;
}
function RestockForm({ product, onSave }) {
    const options = purchaseOptions(product);
    const [unitKey, setUnitKey] = useState(options[0].key);
    const option = options.find(o => o.key === unitKey) || options[0];
    const [quantity, setQuantity] = useState('1');
    const [cost, setCost] = useState(option.price?.toString() ?? '');
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState('');
    let converted = 0;
    try { converted = baseQuantity(Number(quantity), option.factor); } catch { /* Validated on submit. */ }
    const totalCost = cost === '' ? null : Math.round(Number(quantity) * Number(cost));
    return <section className="panel import-quantity"><h2><span className="step-number">2</span> Số lượng & giá nhập</h2><h3>{product.name}</h3>
        {!product.pricing && <div className="info-box">Mặt hàng này đang dùng đơn vị cũ. <Link className="text-link" to={`/inventory/${product.id}`}>Chọn nhóm hàng và khai báo quy cách <ArrowRight size={16}/></Link></div>}
        <form onSubmit={e => { e.preventDefault(); try { if (baseQuantity(Number(quantity), option.factor) <= 0) throw new Error('Nhập số lượng lớn hơn 0.'); setError(''); setConfirm(true); } catch (e) { setError(e.message); } }}>
            <label className="field">Đơn vị nhập<select value={option.key} onChange={e => { const next = options.find(o => o.key === e.target.value); setUnitKey(next.key); setCost(next.price?.toString() ?? ''); setQuantity('1'); }}>{options.map(o => <option key={o.key} value={o.key}>{o.unit}</option>)}</select></label>
            <label className="field">Số lượng nhập thêm ({option.unit})<input required type="number" inputMode={option.unit === 'kg' ? 'decimal' : 'numeric'} min={option.unit === 'kg' && product.pricing?.group === 'seeds' ? '0.1' : '1'} step={option.unit === 'kg' && product.pricing?.group === 'seeds' ? '0.1' : '1'} max="999999" value={quantity} onChange={e => setQuantity(e.target.value)}/></label>
            {option.factor > 1 && <p className="conversion-hint">1 {option.unit} = {option.factor} {product.unit} · Lần này nhập {converted} {product.unit}</p>}
            <MoneyField label={`Giá nhập 1 ${option.unit}`} value={cost} onChange={setCost} required={!!product.pricing}/>
            {totalCost !== null && <div className="repayment-preview"><span>Tổng tiền nhập hàng</span><strong>{formatCurrency(totalCost)}</strong></div>}
            <div className="stock-calculation"><div><span>Hiện có</span><strong>{product.stock} <small>{product.unit}</small></strong></div><ArrowRight size={23}/><div><span>Sau khi nhập</span><strong className="text-green">{product.stock + converted} <small>{product.unit}</small></strong></div></div>
            {error && <p className="error" role="alert">{error}</p>}<button className="button primary full" type="submit"><PackagePlus size={20}/> Xác nhận nhập hàng</button>
        </form>
        {confirm && <Confirm title="Xác nhận nhập hàng" onClose={() => setConfirm(false)} label="Đúng, nhập vào kho" onConfirm={() => { onSave(Number(quantity), option, cost === '' ? undefined : Number(cost)); setConfirm(false); setQuantity('1'); }}><p>Nhập <b>{quantity} {option.unit} {product.name}</b>, tương đương {converted} {product.unit}?</p>{totalCost !== null && <p>Tiền nhập: {formatCurrency(totalCost)}.</p>}<p>Trong kho sẽ có {stockDescription(product, product.stock + converted)}.</p></Confirm>}
    </section>;
}
export function ProductFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const old = useShopStore(s => s.products.find(p => p.id === id));
    if (id && !old) return <Empty title="Không tìm thấy mặt hàng" text="Mặt hàng này không có trong kho."><Link to="/inventory" className="button primary">Về kho hàng</Link></Empty>;
    return <ProductEditor key={id || params.get('group') || 'new'} old={old} initialGroup={params.get('group') || 'snacks'}/>;
}
function ProductEditor({ old, initialGroup }) {
    const navigate = useNavigate();
    const { products, saveProduct, entries } = useShopStore();
    const [name, setName] = useState(old?.name || '');
    const [draft, setDraft] = useState(() => createPricingDraft(old, [...PRODUCT_GROUPS.map(g => g.id), 'other'].includes(initialGroup) ? initialGroup : 'snacks'));
    const [quantity, setQuantity] = useState('0');
    const [importKey, setImportKey] = useState('pack');
    const [active, setActive] = useState(old?.isActive ?? true);
    const [pending, setPending] = useState(null);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    let preview, previewError = '';
    try { preview = buildPricing(draft); } catch (e) { previewError = e.message; }
    const options = preview ? purchaseOptions(preview) : [{ key: 'pack', unit: ['snacks', 'drinks', 'beer'].includes(draft.group) ? 'thùng' : draft.group === 'tobacco' ? 'cây' : draft.group === 'seeds' ? 'kg' : draft.retailUnit, factor: 1 }];
    const option = options.find(o => o.key === importKey) || options[0];
    const duplicate = !old && name.trim().length > 2 ? products.find(p => p.isActive && matches(p.name, name.trim())) : undefined;
    const submit = e => {
        e.preventDefault();
        try {
            const config = buildPricing(draft);
            const product = { ...old, id: old?.id || crypto.randomUUID(), name: name.trim(), ...config, stock: old ? convertedExistingStock(old, config) : baseQuantity(Number(quantity), option.factor), isActive: active, category: config.category || old?.category || 'Hàng khác' };
            if (!product.name) throw new Error('Vui lòng nhập tên hàng.');
            setPending(product); setError('');
        } catch (e) { setError(e.message); }
    };
    return <><PageHeading title={old ? 'Thông tin mặt hàng' : 'Thêm hàng mới'} description="Nhập quy cách đóng hàng, giá nhập và giá bán cho từng đơn vị." back={old ? '/inventory' : '/import'}/>{success && <Notice>Đã lưu thông tin mặt hàng.</Notice>}
        <div className="product-form-layout"><form className="panel form-panel" onSubmit={submit}><h2>{old ? old.name : 'Thông tin mặt hàng'}</h2>
            <label className="field">Tên hàng <span>*</span><input required maxLength={120} value={name} placeholder="Ví dụ: Coca-Cola 330 ml" onChange={e => setName(e.target.value)}/></label>
            {duplicate && <div className="info-box">Đã có “{duplicate.name}” trong kho. <Link className="text-link" to={`/import/existing?product=${duplicate.id}`}>Nhập thêm hàng này <ArrowRight size={17}/></Link></div>}
            <PricingFields draft={draft} onChange={setDraft} onGroupChange={group => { setDraft(changePricingGroup(draft, group)); setQuantity('0'); setImportKey('pack'); }}/>
            {!old && <div className="pricing-section"><h3>Số lượng nhập ban đầu</h3><label className="field">Đơn vị nhập<select value={option.key} onChange={e => setImportKey(e.target.value)}>{options.map(o => <option value={o.key} key={o.key}>{o.unit}</option>)}</select></label><label className="field">Số lượng ({option.unit})<input type="number" required min="0" max="999999" step={draft.group === 'seeds' ? '0.1' : '1'} inputMode={draft.group === 'seeds' ? 'decimal' : 'numeric'} value={quantity} onChange={e => setQuantity(e.target.value)}/></label>{preview && <p className="conversion-hint">1 {option.unit} = {option.factor} {preview.unit}. Có thể nhập 0 nếu chưa có hàng.</p>}</div>}
            {old && <label className="checkbox-field"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/> Tiếp tục bán mặt hàng này</label>}
            {error && <p className="error" role="alert">{error}</p>}<button className="button primary full" type="submit">{old ? 'Lưu thay đổi' : 'Thêm vào kho'}<Check size={20}/></button>
        </form><aside>{preview ? <div className="panel pricing-summary"><h2>Đơn vị & giá đã chọn</h2><p className="muted">{preview.category || 'Hàng khác'} · {name || 'Mặt hàng mới'}</p><h3>Nhập hàng</h3>{purchaseOptions(preview).map(o => <div className="price-summary-row" key={o.key}><span>1 {o.unit}{o.factor > 1 && <small>= {o.factor} {preview.unit}</small>}</span><b>{o.price === undefined ? 'Chưa có giá' : formatCurrency(o.price)}</b></div>)}<h3>Bán hàng</h3>{saleOptions(preview).map(o => <div className="price-summary-row" key={o.key}><span>1 {o.unit}</span><b>{formatCurrency(o.price)}</b></div>)}<p className="conversion-hint">Kho được theo dõi theo {preview.unit} để bán lẻ và nguyên kiện cùng trừ đúng số hàng.</p></div> : <div className="form-guidance"><PackagePlus size={35}/><h2>Khai báo đúng,<br/>bán hàng dễ hơn.</h2><p>{previewError}</p><p>Nhập đúng số lượng bên trong thùng, bịch hoặc cây theo mặt hàng thực tế.</p></div>}
            {old && <><div className="panel stock-side"><Package size={31}/><h2>Trong kho đang có</h2><strong className="stock-text">{stockDescription(old)}</strong><Link to={`/import/existing?product=${old.id}`} className="button secondary full">Nhập thêm hàng <Plus size={18}/></Link></div><div className="panel product-history"><h2>Lịch sử mặt hàng</h2><ActivityList entries={entries.filter(e => e.productId === old.id || e.items?.some(i => i.productId === old.id || i.name === old.name))}/></div></>}
        </aside></div>
        {pending && <Confirm title={old ? 'Lưu thông tin mặt hàng?' : 'Thêm hàng mới vào kho?'} onClose={() => setPending(null)} label={old ? 'Lưu thay đổi' : 'Thêm vào kho'} onConfirm={() => { saveProduct(pending); setPending(null); if (!old) navigate('/inventory?added=1'); else setSuccess(true); }}><p><b>{pending.name}</b> · {pending.category}</p><p>Giá bán lẻ: {formatCurrency(pending.price)}/{pending.unit}.</p>{saleOptions(pending).filter(o => o.key === 'pack').map(o => <p key={o.key}>Giá bán 1 {o.unit}: {formatCurrency(o.price)}.</p>)}<p>Trong kho: {stockDescription(pending)}.</p>{old && old.unit !== pending.unit && <p>Quy đổi tồn hiện tại từ {old.unit} sang {pending.unit} theo quy cách vừa nhập.</p>}{!active && <p>Mặt hàng sẽ được ngừng bán, lịch sử vẫn được giữ lại.</p>}</Confirm>}
    </>;
}
export function InventoryPage() {
    const { products } = useShopStore();
    const [params] = useSearchParams();
    const [filter, setFilter] = useState(params.get('filter') || 'all');
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    const shown = products.filter(p => matches(p.name, query) && (group === 'all' || (p.pricing?.group || 'other') === group) && (filter === 'inactive' ? !p.isActive : p.isActive && (filter === 'all' || (filter === 'low' && p.stock > 0 && p.stock <= 5) || (filter === 'out' && p.stock === 0))));
    const filters = [{ id: 'all', label: 'Tất cả', count: products.filter(p => p.isActive).length }, { id: 'low', label: 'Sắp hết', count: products.filter(p => p.isActive && p.stock > 0 && p.stock <= 5).length }, { id: 'out', label: 'Đã hết', count: products.filter(p => p.isActive && !p.stock).length }, { id: 'inactive', label: 'Ngừng bán', count: products.filter(p => !p.isActive).length }];
    return <><PageHeading title="Kho hàng" description="Xem tồn kho và giá bán theo từng đơn vị." action={<Link className="button primary" to="/import"><Plus size={20}/> Thêm hàng mới</Link>}/>{params.has('added') && <Notice>Đã thêm mặt hàng mới vào kho.</Notice>}<section className="panel inventory-panel"><div className="inventory-tools"><SearchBox value={query} onChange={setQuery}/><button className="button secondary" onClick={() => exportCsv('kho-hang.csv', productCsvRows(products))}><Download size={19}/> Tải danh sách</button></div><label className="field">Nhóm hàng<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">Tất cả nhóm hàng</option>{PRODUCT_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}<option value="other">Hàng khác / chưa phân nhóm</option></select></label><div className="filter-tabs">{filters.map(f => <button key={f.id} aria-pressed={filter === f.id} className={filter === f.id ? 'selected' : ''} onClick={() => setFilter(f.id)}>{f.label}<span>{f.count}</span></button>)}</div><div className="inventory-table-head"><span>Mặt hàng</span><span>Giá bán</span><span>Còn lại</span><span/></div>{shown.map(p => <Link key={p.id} to={`/inventory/${p.id}`} className="inventory-row"><div><ProductSymbol category={p.category}/><span><strong>{p.name}</strong><small>{p.category}</small></span></div><div className="inventory-prices">{saleOptions(p).map(o => <span key={o.key}>{formatCurrency(o.price)}<small> / {o.unit}</small></span>)}</div><span className={`stock-pill inventory-stock ${p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : ''}`}>{p.isActive ? stockDescription(p) : 'Ngừng bán'}</span><ChevronRight size={20}/></Link>)}{!shown.length && <Empty title="Không có mặt hàng phù hợp" text="Thử tìm tên khác hoặc chọn “Tất cả” nhé."/>}</section><p className="page-hint">Chạm vào mặt hàng để sửa giá, quy cách hoặc nhập thêm.</p></>;
}

