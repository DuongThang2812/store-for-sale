import { useShallow } from 'zustand/react/shallow';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, PackagePlus, Plus, Package, Download, ChevronRight, Check, Cookie, GlassWater, Beer, Wheat, Sprout, Boxes, Apple } from 'lucide-react';
import { useActiveShopStore } from '../stores/useActiveShopStore';
import { useAccountStore } from '../stores/useAccountStore';
import { categoryService } from '../services/categoryService';
import { ActivityList, Confirm, Empty, Notice, PageHeading, SearchBox } from '../components/ui';
import { MoneyField, PricingFields } from '../components/PricingFields';
import { matches, exportCsv } from '../utils/shopHelpers';
import { ProductSymbol } from '../components/ProductSymbol';
import { CloudActivityList } from '../components/CloudActivityList';
import { StockTools } from '../components/StockTools';
import { canUseShopOperation } from '../domain/shopPermissions';
import { productCsvRows } from '../utils/stockCsv';
import { formatCurrency } from '../utils/formatters';
import { PRODUCT_GROUPS, productGroupsForBusiness, createPricingDraft, changePricingGroup, buildPricing, purchaseOptions, saleOptions, baseQuantity, gramsFromKg, formatKgFromGrams, moneyForBaseQuantity, isWeightUnit, isWeightedProduct, retailUnitLabel, stockDescription, convertedExistingStock } from '../utils/productPricing';

import { useProductSearch } from '../hooks/useProductSearch';
import { useListWindow } from '../hooks/useListWindow';
import { ListMore } from '../components/ListMore';

const groupIcons = { snacks: Cookie, drinks: GlassWater, beer: Beer, spices: Sprout, seeds: Wheat, tobacco: Boxes, fruit: Apple };
const lowStockLimit = product => product.lowStockThreshold ?? (isWeightedProduct(product) ? product.pricing.group === 'fruit' ? 5000 : 500 : 5);
export function ImportPage() {
    const store = useAccountStore(s => s.store);
    const businessType = useAccountStore(s => s.store?.businessType);
    const groups = productGroupsForBusiness(businessType);
    if (store.role !== 'owner') return <Navigate to="/import/existing" replace/>;
    return <><PageHeading title="Nhập hàng" description={businessType === 'fruit_shop' ? 'Thêm trái cây theo cân, quả hoặc đơn vị đóng gói.' : 'Chọn nhóm hàng để nhập đúng đơn vị và giá bán.'} action={<Link className="button primary" to="/import/existing"><PackagePlus size={20}/> Nhập thêm hàng đã có</Link>}/>
        <div className="section-heading"><h2>Thêm mặt hàng theo nhóm</h2><span>Mỗi nhóm có quy cách và giá riêng</span></div>
        <div className="import-group-grid">{groups.map((group, i) => { const Icon = groupIcons[group.id]; return <Link className="panel import-group-card" key={group.id} to={`/import/new?group=${group.id}`}><span className={`choice-icon ${['green', 'blue', 'orange', 'purple'][i % 4]}`}><Icon size={32}/></span><h2>{group.label}</h2><p>{group.description}</p><span className="text-link">Thêm hàng mới <ArrowRight size={17}/></span></Link>; })}</div>
        <div className="import-extra-links"><Link className="button secondary" to="/import/csv"><Download size={20}/> Nhập danh sách từ CSV</Link><Link className="button secondary" to="/import/catalog"><Download size={20}/> Nhập danh mục giá từ Excel</Link><Link className="text-link" to="/import/new?group=other">Thêm mặt hàng khác <Plus size={18}/></Link></div>
        <div className="info-box import-tip"><Package size={23}/> Hàng đã có trong tiệm? Chọn “Nhập thêm hàng đã có” để cộng số lượng vào đúng mặt hàng.</div>
    </>;
}
export function ImportExistingPage() {
    const businessType = useAccountStore(s => s.store?.businessType);
    const dataMode = useAccountStore(s => s.dataMode);
    const { products, addStock, undoStock } = useActiveShopStore(useShallow(s => ({ products: s.products, addStock: s.addStock, undoStock: s.undoStock })));
    const [params] = useSearchParams();
    const [selected, setSelected] = useState(params.get('product') || '');
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    const [success, setSuccess] = useState('');
    const [undo, setUndo] = useState('');
    const [error, setError] = useState('');
    useEffect(() => { if (!undo) return; const timer = setTimeout(() => setUndo(''), 12000); return () => clearTimeout(timer); }, [undo]);
    const product = products.find(p => p.id === selected && p.isActive);
    const { found, deferredQuery } = useProductSearch(products, query);
    const shown = useMemo(() => found.filter(p => p.isActive && (group === 'all' || (p.pricing?.group || 'other') === group)), [found, group]);
    const { visible, showMore, hasMore } = useListWindow(shown, JSON.stringify([deferredQuery, group]));
    return <><PageHeading title="Nhập thêm hàng" description="Chọn hàng, đơn vị nhập và giá của lần nhập này." back="/import"/>
        {success && <Notice action={undo && dataMode !== 'supabase' && <button className="text-link" onClick={() => { try { undoStock(undo); setSuccess('Đã hoàn tác lần nhập hàng vừa rồi.'); setUndo(''); } catch (e) { setError(e.message); } }}>Hoàn tác</button>} onClose={() => setSuccess('')}>{success}</Notice>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="stock-import-layout"><section className="panel selection-panel"><h2><span className="step-number">1</span> Chọn mặt hàng</h2><SearchBox value={query} onChange={setQuery}/><label className="field">Nhóm hàng<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">Tất cả nhóm hàng</option>{productGroupsForBusiness(businessType).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}<option value="other">Hàng khác / chưa phân nhóm</option></select></label><div className="selection-list">{visible.map(item => <button className={selected === item.id ? 'selected' : ''} onClick={() => setSelected(item.id)} key={item.id}><ProductSymbol category={item.category}/><span><b>{item.name}</b><small>Hiện còn {stockDescription(item)}</small></span>{selected === item.id ? <Check size={21}/> : <ChevronRight size={20}/>}</button>)}<ListMore shown={visible.length} total={shown.length} onMore={showMore} hasMore={hasMore}/>{!shown.length && <Empty title="Không tìm thấy hàng" text="Thử tên khác hoặc chọn nhóm hàng khác."/>}</div></section>
        {product ? <RestockForm key={product.id} product={product} requireCost={dataMode === 'supabase'} onSave={async (quantity, option, cost) => { const entryId = await addStock(product.id, quantity, option.key, cost); setSuccess(dataMode === 'supabase' ? `Đã nhập ${quantity} ${option.unit} ${product.name}. Kho đã cập nhật trên DB.` : `Đã nhập ${quantity} ${option.unit} ${product.name}. Trong kho hiện có ${stockDescription(product, product.stock + baseQuantity(quantity, option.factor))}.`); setUndo(dataMode === 'supabase' ? '' : entryId); setError(''); }}/> : <section className="panel import-quantity"><Empty title="Chọn hàng ở bước 1" text="Đơn vị, giá nhập và tồn kho sẽ hiện ở đây."/></section>}</div>
    </>;
}
function RestockForm({ product, onSave, requireCost = false }) {
    const options = purchaseOptions(product);
    const weighted = isWeightedProduct(product);
    const [unitKey, setUnitKey] = useState(options[0].key);
    const option = options.find(o => o.key === unitKey) || options[0];
    const [quantity, setQuantity] = useState('1');
    const [cost, setCost] = useState(option.price?.toString() ?? '');
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState('');
    let converted = 0;
    try { converted = baseQuantity(quantity, option.factor); } catch { /* Validated on submit. */ }
    let totalCost = null;
    try { if (cost !== '' && converted > 0) totalCost = moneyForBaseQuantity(Number(cost), converted, option.factor); } catch { /* Validated on submit. */ }
    return <section className="panel import-quantity"><h2><span className="step-number">2</span> Số lượng & giá nhập</h2><h3>{product.name}</h3>
        {!product.pricing && <div className="info-box">Mặt hàng này đang dùng đơn vị cũ. <Link className="text-link" to={`/inventory/${product.id}`}>Chọn nhóm hàng và khai báo quy cách <ArrowRight size={16}/></Link></div>}
        <form onSubmit={e => { e.preventDefault(); try { if (baseQuantity(quantity, option.factor) <= 0) throw new Error('Nhập số lượng lớn hơn 0.'); if (requireCost && cost === '') throw new Error('Vui lòng nhập giá vốn của lần nhập này.'); setError(''); setConfirm(true); } catch (e) { setError(e.message); } }}>
            <label className="field">Đơn vị nhập<select value={option.key} onChange={e => { const next = options.find(o => o.key === e.target.value); setUnitKey(next.key); setCost(next.price?.toString() ?? ''); setQuantity('1'); }}>{options.map(o => <option key={o.key} value={o.key}>{o.unit}</option>)}</select></label>
            <label className="field">Số lượng nhập thêm ({option.unit})<input required type="number" inputMode={option.unit === 'kg' ? 'decimal' : 'numeric'} min={weighted && isWeightUnit(option.unit) ? String(1 / option.factor) : option.unit === 'kg' && product.pricing?.group === 'seeds' ? '0.1' : '1'} step={weighted && isWeightUnit(option.unit) ? String(1 / option.factor) : option.unit === 'kg' && product.pricing?.group === 'seeds' ? '0.1' : '1'} max="999999" value={quantity} onChange={e => setQuantity(e.target.value)}/></label>
            {option.factor > 1 && <p className="conversion-hint">1 {option.unit} = {option.factor} {product.unit} · Lần này nhập {converted} {product.unit}</p>}
            <MoneyField label={`Giá nhập 1 ${option.unit}`} value={cost} onChange={setCost} required={requireCost || !!product.pricing}/>
            {totalCost !== null && <div className="repayment-preview"><span>Tổng tiền nhập hàng</span><strong>{formatCurrency(totalCost)}</strong></div>}
            <div className="stock-calculation"><div><span>Hiện có</span><strong>{stockDescription(product)}</strong></div><ArrowRight size={23}/><div><span>Sau khi nhập</span><strong className="text-green">{stockDescription(product, product.stock + converted)}</strong></div></div>
            {error && <p className="error" role="alert">{error}</p>}<button className="button primary full" type="submit"><PackagePlus size={20}/> Xác nhận nhập hàng</button>
        </form>
        {confirm && <Confirm title="Xác nhận nhập hàng" onClose={() => setConfirm(false)} label="Đúng, nhập vào kho" onConfirm={async () => { await onSave(Number(quantity), option, cost === '' ? undefined : Number(cost)); setConfirm(false); setQuantity('1'); }}><p>Nhập <b>{quantity} {option.unit} {product.name}</b>, tương đương {weighted ? formatKgFromGrams(converted) : `${converted} ${product.unit}`}?</p>{totalCost !== null && <p>Tiền nhập: {formatCurrency(totalCost)}.</p>}<p>Trong kho sẽ có {stockDescription(product, product.stock + converted)}.</p></Confirm>}
    </section>;
}
export function ProductFormPage() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const businessType = useAccountStore(s => s.store?.businessType);
    const store = useAccountStore(s => s.store);
    const dataMode = useAccountStore(s => s.dataMode);
    const entries = useActiveShopStore(s => s.entries);
    const old = useActiveShopStore(s => s.products.find(p => p.id === id));
    if (id && !old) return <Empty title="Không tìm thấy mặt hàng" text="Mặt hàng này không có trong kho."><Link to="/inventory" className="button primary">Về kho hàng</Link></Empty>;
    if (old && store.role !== 'owner') return <><PageHeading title={old.name} description={old.category} back="/inventory"/>
        <section className="panel form-panel"><h2>Trong kho: {stockDescription(old)}</h2>
            {saleOptions(old).map(option => <p key={option.key}>{formatCurrency(option.price)} / {option.unit}</p>)}
            {canUseShopOperation(store, 'receiveStock') && <Link className="button secondary" to={`/import/existing?product=${old.id}`}>Nhập thêm hàng</Link>}
            {dataMode === 'supabase' ? <CloudActivityList productId={old.id} revision={old.version}/>
                : <ActivityList entries={entries.filter(entry => entry.productId === old.id || entry.items?.some(item => item.productId === old.id || item.name === old.name))}/>}
        </section></>;
    const groups = productGroupsForBusiness(businessType);
    const requested = params.get('group');
    const initialGroup = old?.pricing?.group || (groups.some(item => item.id === requested) || requested === 'other' ? requested : groups[0].id);
    return <ProductEditor key={id || initialGroup} old={old} initialGroup={initialGroup}/>;
}
function ProductEditor({ old, initialGroup }) {
    const navigate = useNavigate();
    const storeId = useAccountStore(s => s.store?.id);
    const businessType = useAccountStore(s => s.store?.businessType);
    const role = useAccountStore(s => s.store?.role);
    const dataMode = useAccountStore(s => s.dataMode);
    const { products, saveProduct, adjustFruitStock, entries } = useActiveShopStore(useShallow(s => ({ products: s.products, saveProduct: s.saveProduct, adjustFruitStock: s.adjustFruitStock, entries: s.entries })));
    const groups = productGroupsForBusiness(businessType);
    const [name, setName] = useState(old?.name || '');
    const [category, setCategory] = useState(old?.category || '');
    const [categoryResult, setCategoryResult] = useState({ storeId: null, names: [] });
    const categorySuggestions = dataMode === 'demo' ? [...new Set(products.map(product => product.category).filter(Boolean))]
        : categoryResult.storeId === storeId ? categoryResult.names : [];
    const [draft, setDraft] = useState(() => createPricingDraft(old, [...PRODUCT_GROUPS.map(g => g.id), 'other'].includes(initialGroup) ? initialGroup : groups[0].id));
    const [quantity, setQuantity] = useState('0');
    const [importKey, setImportKey] = useState('pack');
    const [active, setActive] = useState(old?.isActive ?? true);
    const [pending, setPending] = useState(null);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');
    useEffect(() => {
        if (!storeId || dataMode !== 'supabase') return;
        let activeRequest = true;
        void categoryService.list(storeId).then(rows => { if (activeRequest) setCategoryResult({ storeId, names: rows.filter(row => row.is_active).map(row => row.name) }); }).catch(() => {});
        return () => { activeRequest = false; };
    }, [storeId, dataMode]);
    let preview, previewError = '';
    try { preview = buildPricing(draft); } catch (e) { previewError = e.message; }
    const options = preview ? purchaseOptions(preview) : [{ key: 'pack', unit: ['snacks', 'drinks', 'beer'].includes(draft.group) ? 'thùng' : draft.group === 'tobacco' ? 'cây' : ['seeds', 'fruit'].includes(draft.group) ? 'kg' : draft.retailUnit, factor: 1 }];
    const option = options.find(o => o.key === importKey) || options[0];
    const duplicate = !old && name.trim().length > 2 ? products.find(p => p.isActive && matches(p.name, name.trim())) : undefined;
    const submit = e => {
        e.preventDefault();
        try {
            const config = buildPricing(draft);
            if (old?.supplierQuote && active && config.price === 0) throw new Error('Hãy nhập giá bán lẻ trước khi bật bán mặt hàng nháp.');
            const product = { ...old, id: old?.id || crypto.randomUUID(), name: name.trim(), ...config, stock: old ? convertedExistingStock(old, config) : baseQuantity(quantity, option.factor), isActive: active, category: category.trim() || config.category || old?.category || 'Hàng khác', lowStockThreshold: old?.lowStockThreshold ?? (isWeightedProduct(config) ? draft.group === 'fruit' ? 5000 : 500 : 5) };
            if (!product.name) throw new Error('Vui lòng nhập tên hàng.');
            setPending(product); setError('');
        } catch (e) { setError(e.message); }
    };
    return <><PageHeading title={old ? 'Thông tin mặt hàng' : 'Thêm hàng mới'} description={draft.group === 'fruit' ? 'Chọn đơn vị cân hoặc đếm, giá mỗi đơn vị và loại trái cây.' : 'Nhập quy cách đóng hàng, giá nhập và giá bán cho từng đơn vị.'} back={old ? '/inventory' : '/import'}/>{success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}
        <div className="product-form-layout"><form className="panel form-panel" onSubmit={submit}><h2>{old ? old.name : 'Thông tin mặt hàng'}</h2>
            <label className="field">Tên hàng <span>*</span><input required maxLength={120} value={name} placeholder={draft.group === 'fruit' ? 'Ví dụ: Táo Envy' : 'Ví dụ: Coca-Cola 330 ml'} onChange={e => setName(e.target.value)}/></label>
            {<label className="field">{draft.group === 'fruit' ? 'Loại trái cây' : 'Danh mục hàng'}<input list="product-categories" maxLength={80} value={category} onChange={event => setCategory(event.target.value)} placeholder={draft.group === 'fruit' ? 'Ví dụ: Táo, cam, nho' : 'Ví dụ: Nước nhập khẩu, hàng khô'}/><datalist id="product-categories">{categorySuggestions.map(item => <option key={item} value={item}/>)}</datalist><small>Có thể nhập danh mục riêng{dataMode === 'supabase' && <> hoặc chọn danh mục đã tạo trong <Link to="/categories">Danh mục</Link></>}.</small></label>}
            {old?.supplierQuote && <div className="info-box"><div><b>Giá nhập từ danh sách: </b>{old.supplierQuote.purchasePrice === null ? 'Chưa rõ' : formatCurrency(old.supplierQuote.purchasePrice)}{old.supplierQuote.purchaseUnit ? ` / ${old.supplierQuote.purchaseUnit}` : ' · chưa rõ đơn vị'}</div>{old.supplierQuote.tiers && <div>Giá bậc / khuyến mãi: {old.supplierQuote.tiers}</div>}{old.supplierQuote.availability && <div>Tình trạng nguồn: {old.supplierQuote.availability}</div>}{old.supplierQuote.reviewNote && <div>Cần rà soát: {old.supplierQuote.reviewNote}</div>}<div className="muted">Giá này chỉ để đối chiếu. Hãy xác nhận quy cách, giá bán và tồn thực tế.</div></div>}
            {duplicate && <div className="info-box">Đã có “{duplicate.name}” trong kho. <Link className="text-link" to={`/import/existing?product=${duplicate.id}`}>Nhập thêm hàng này <ArrowRight size={17}/></Link></div>}
            <PricingFields draft={draft} groups={old?.pricing?.group && !groups.some(item => item.id === old.pricing.group) ? [...groups, PRODUCT_GROUPS.find(item => item.id === old.pricing.group)].filter(Boolean) : groups} onChange={setDraft} onGroupChange={group => { setDraft(changePricingGroup(draft, group)); setQuantity('0'); setImportKey('pack'); }}/>
            {!old && <div className="pricing-section"><h3>Số lượng nhập ban đầu</h3><label className="field">Đơn vị nhập<select value={option.key} onChange={e => setImportKey(e.target.value)}>{options.map(o => <option value={o.key} key={o.key}>{o.unit}</option>)}</select></label><label className="field">Số lượng ({option.unit})<input type="number" required min="0" max="999999" step={preview && isWeightedProduct(preview) && isWeightUnit(option.unit) ? String(1 / option.factor) : draft.group === 'seeds' ? '0.1' : '1'} inputMode={['seeds', 'fruit'].includes(draft.group) ? 'decimal' : 'numeric'} value={quantity} onChange={e => setQuantity(e.target.value)}/></label>{preview && <p className="conversion-hint">1 {option.unit} = {option.factor} {preview.unit}. Có thể nhập 0 nếu chưa có hàng.</p>}</div>}
            {old && <label className="checkbox-field"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/> Tiếp tục bán mặt hàng này</label>}
            {error && <p className="error" role="alert">{error}</p>}<button className="button primary full" type="submit">{old ? 'Lưu thay đổi' : 'Thêm vào kho'}<Check size={20}/></button>
        </form><aside>{preview ? <div className="panel pricing-summary"><h2>Đơn vị & giá đã chọn</h2><p className="muted">{category || preview.category || 'Hàng khác'} · {name || 'Mặt hàng mới'}</p><h3>Nhập hàng</h3>{purchaseOptions(preview).map(o => <div className="price-summary-row" key={o.key}><span>1 {o.unit}{o.factor > 1 && <small>= {o.factor} {preview.unit}</small>}</span><b>{o.price === undefined ? 'Chưa có giá' : formatCurrency(o.price)}</b></div>)}<h3>Bán hàng</h3>{saleOptions(preview).map(o => <div className="price-summary-row" key={o.key}><span>1 {o.unit}</span><b>{formatCurrency(o.price)}</b></div>)}<p className="conversion-hint">{isWeightedProduct(preview) ? 'Kho theo gram; mỗi đơn vị bán cùng trừ đúng số gram.' : `Kho được theo dõi theo ${preview.unit} để bán lẻ và nguyên kiện cùng trừ đúng số hàng.`}</p></div> : <div className="form-guidance"><PackagePlus size={35}/><h2>Khai báo đúng,<br/>bán hàng dễ hơn.</h2><p>{previewError}</p><p>{draft.group === 'fruit' ? 'Nhập giá mỗi kg và trọng lượng chính xác đến 1 gram.' : 'Nhập đúng số lượng bên trong thùng, bịch hoặc cây theo mặt hàng thực tế.'}</p></div>}
            {old && <><div className="panel stock-side"><Package size={31}/><h2>Trong kho đang có</h2><strong className="stock-text">{stockDescription(old)}</strong><Link to={`/import/existing?product=${old.id}`} className="button secondary full">Nhập thêm hàng <Plus size={18}/></Link></div>{dataMode === 'supabase' && role === 'owner' && <StockTools key={old.id} product={old} onDone={setSuccess}/>}
            {dataMode === 'demo' && old.pricing?.group === 'fruit' && isWeightedProduct(old) && role === 'owner' && <FruitAdjustmentForm product={old} onSave={async (kilograms, reason, note) => { await adjustFruitStock(old.id, kilograms, reason, note); setSuccess(dataMode === 'supabase' ? 'Đã ghi hao hụt và cập nhật tồn kho trên DB.' : 'Đã ghi hao hụt và cập nhật tồn kho trên máy.'); }}/>}<div className="panel product-history"><h2>Lịch sử mặt hàng</h2>{dataMode === 'supabase' ? <CloudActivityList productId={old.id} revision={old.version}/> : <ActivityList entries={entries.filter(e => e.productId === old.id || e.items?.some(i => i.productId === old.id || i.name === old.name))}/>}</div></>}
        </aside></div>
        {pending && <Confirm title={old ? 'Lưu thông tin mặt hàng?' : 'Thêm hàng mới vào kho?'} onClose={() => setPending(null)} label={old ? 'Lưu thay đổi' : 'Thêm vào kho'} onConfirm={async () => { await saveProduct(pending); setPending(null); if (!old) navigate('/inventory?added=1'); else setSuccess('Đã lưu thông tin mặt hàng.'); }}><p><b>{pending.name}</b> · {pending.category}</p><p>Giá bán lẻ: {formatCurrency(pending.price)}/{retailUnitLabel(pending)}.</p>{saleOptions(pending).filter(o => o.key === 'pack').map(o => <p key={o.key}>Giá bán 1 {o.unit}: {formatCurrency(o.price)}.</p>)}<p>Trong kho: {stockDescription(pending)}.</p>{old && old.unit !== pending.unit && <p>Quy đổi tồn hiện tại từ {old.unit} sang {pending.unit} theo quy cách vừa nhập.</p>}{!active && <p>Mặt hàng sẽ được ngừng bán, lịch sử vẫn được giữ lại.</p>}</Confirm>}
    </>;
}
function FruitAdjustmentForm({ product, onSave }) {
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('spoiled');
    const [note, setNote] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [error, setError] = useState('');
    let grams = 0;
    try { grams = gramsFromKg(quantity); } catch { /* Validate when submitting. */ }
    const valid = grams > 0 && grams <= product.stock && note.length <= 300;
    return <section className="panel stock-side"><h2>Hàng hư / hao hụt</h2><p className="muted">Ghi lại lý do và trọng lượng để kho luôn đúng. Hiện còn {stockDescription(product)}.</p>
        <form onSubmit={event => { event.preventDefault(); if (!valid) { setError('Nhập trọng lượng từ 0,001 kg đến số hàng còn trong kho.'); return; } setError(''); setConfirm(true); }}>
            <label className="field">Trọng lượng giảm (kg)<input required type="number" inputMode="decimal" min="0.001" step="0.001" max={product.stock / 1000} value={quantity} onChange={event => setQuantity(event.target.value)} placeholder="Ví dụ: 1,2"/></label>
            <label className="field">Lý do<select value={reason} onChange={event => setReason(event.target.value)}><option value="spoiled">Hàng hư</option><option value="damaged">Dập, hỏng</option><option value="lost">Thất lạc</option><option value="personal_use">Dùng riêng</option><option value="other">Hao hụt khác</option></select></label>
            <label className="field">Ghi chú thêm<input maxLength={300} value={note} onChange={event => setNote(event.target.value)} placeholder="Không bắt buộc"/></label>
            {error && <p className="error" role="alert">{error}</p>}<button type="submit" className="button secondary full" disabled={!product.stock}>Ghi hao hụt</button>
        </form>
        {confirm && <Confirm title="Ghi hao hụt trái cây?" label="Đúng, trừ khỏi kho" onClose={() => setConfirm(false)} onConfirm={async () => { await onSave(quantity, reason, note); setQuantity(''); setNote(''); setConfirm(false); setError(''); }}><p>Giảm <b>{formatKgFromGrams(grams)} {product.name}</b> khỏi kho?</p><p>Sau khi ghi còn <b>{formatKgFromGrams(product.stock - grams)}</b>. Lần điều chỉnh này sẽ có trong lịch sử.</p></Confirm>}
    </section>;
}
export function InventoryPage() {
    const mode = useAccountStore(s => s.dataMode);
    const role = useAccountStore(s => s.store?.role);
    const businessType = useAccountStore(s => s.store?.businessType);
    const { products } = useActiveShopStore(useShallow(s => ({ products: s.products })));
    const [params] = useSearchParams();
    const [filter, setFilter] = useState(params.get('filter') || 'all');
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState('all');
    const { found, deferredQuery } = useProductSearch(products, query);
    const shown = useMemo(() => found.filter(p => (group === 'all' || (p.pricing?.group || p.draftGroup || 'other') === group) && (filter === 'inactive' ? !p.isActive : p.isActive && (filter === 'all' || (filter === 'low' && p.stock > 0 && p.stock <= lowStockLimit(p)) || (filter === 'out' && p.stock === 0)))), [found, group, filter]);
    const { visible, showMore, hasMore } = useListWindow(shown, JSON.stringify([deferredQuery, group, filter]));
    const filters = useMemo(() => [{ id: 'all', label: 'Tất cả', count: products.filter(p => p.isActive).length }, { id: 'low', label: 'Sắp hết', count: products.filter(p => p.isActive && p.stock > 0 && p.stock <= lowStockLimit(p)).length }, { id: 'out', label: 'Đã hết', count: products.filter(p => p.isActive && !p.stock).length }, { id: 'inactive', label: 'Ngừng bán', count: products.filter(p => !p.isActive).length }], [products]);
    return <><PageHeading title="Kho hàng" description={businessType === 'fruit_shop' ? 'Xem số lượng còn lại và giá bán theo từng đơn vị.' : 'Xem tồn kho và giá bán theo từng đơn vị.'} action={<Link className="button primary" to="/import"><Plus size={20}/> Thêm hàng mới</Link>}/>{params.has('added') && <Notice>Đã thêm mặt hàng mới vào kho.</Notice>}<section className="panel inventory-panel"><div className="inventory-tools">{mode === 'supabase' && role === 'owner' && <Link className="button secondary" to="/inventory/count">Kiểm kê kho</Link>}<SearchBox value={query} onChange={setQuery}/><button className="button secondary" onClick={() => exportCsv('kho-hang.csv', productCsvRows(products))}><Download size={19}/> Tải danh sách</button></div><label className="field">Nhóm hàng<select value={group} onChange={e => setGroup(e.target.value)}><option value="all">Tất cả nhóm hàng</option>{productGroupsForBusiness(businessType).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}<option value="other">Hàng khác / chưa phân nhóm</option></select></label><div className="filter-tabs">{filters.map(f => <button key={f.id} aria-pressed={filter === f.id} className={filter === f.id ? 'selected' : ''} onClick={() => setFilter(f.id)}>{f.label}<span>{f.count}</span></button>)}</div><div className="inventory-table-head"><span>Mặt hàng</span><span>Giá bán</span><span>Còn lại</span><span/></div>{visible.map(p => <Link key={p.id} to={`/inventory/${p.id}`} className="inventory-row"><div><ProductSymbol category={p.category}/><span><strong>{p.name}</strong><small>{p.category}</small></span></div><div className="inventory-prices">{saleOptions(p).map(o => <span key={o.key}>{formatCurrency(o.price)}<small> / {o.unit}</small></span>)}</div><span className={`stock-pill inventory-stock ${p.stock === 0 ? 'out' : p.stock <= lowStockLimit(p) ? 'low' : ''}`}>{p.isActive ? stockDescription(p) : 'Ngừng bán'}</span><ChevronRight size={20}/></Link>)}<ListMore shown={visible.length} total={shown.length} onMore={showMore} hasMore={hasMore}/>{!shown.length && <Empty title="Không có mặt hàng phù hợp" text="Thử tìm tên khác hoặc chọn “Tất cả” nhé."/>}</section><p className="page-hint">Chạm vào mặt hàng để sửa giá, quy cách hoặc nhập thêm.</p></>;
}

