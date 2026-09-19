import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingBasket, Plus, ArrowRight, Check, Trash2, Package, Milk, Coffee, Cookie, Droplets, BookOpen, Beer, Wheat, Boxes } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { Confirm, Empty, PageHeading, SearchBox, Stepper } from '../components/ui';
import { matches } from '../utils/shopHelpers';
import { formatCurrency } from '../utils/formatters';
import { PRODUCT_GROUPS, saleOptions, cartKey, cartLines, availableForOption, stockDescription } from '../utils/productPricing';

export function ProductSymbol({ category }) {
    const icons = { 'Đồ uống': Coffee, 'Nước': Coffee, 'Bia': Beer, 'Hạt': Wheat, 'Thuốc lá': Boxes, 'Sữa & bánh': Milk, 'Bánh kẹo': Cookie, 'Đồ ăn': Cookie, 'Gia vị': Droplets };
    const Icon = icons[category] || Package;
    return <span className={`product-symbol ${['Nước', 'Đồ uống'].includes(category) ? 'blue' : category === 'Sữa & bánh' ? 'purple' : ['Gia vị', 'Bia'].includes(category) ? 'orange' : 'green'}`}><Icon size={29} strokeWidth={1.6}/></span>;
}
export function SalesPage() {
    const { products, cart: regularCart, debtCarts, customers, setQuantity } = useShopStore();
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('Tất cả');
    const [unitChoices, setUnitChoices] = useState({});
    const [params] = useSearchParams();
    const customerId = params.get('customer');
    const debtCustomer = customers.find(c => c.id === customerId);
    const cart = customerId ? debtCarts[customerId] || {} : regularCart;
    const categories = ['Tất cả', ...new Set([...PRODUCT_GROUPS.map(g => g.label), ...products.map(p => p.category).filter(Boolean)])];
    const shown = products.filter(p => p.isActive && matches(p.name, query) && (category === 'Tất cả' || p.category === category));
    const selected = cartLines(products, cart);
    const total = selected.reduce((sum, line) => sum + line.amount, 0);
    const cartLink = `/cart${customerId ? `?customer=${customerId}` : ''}`;
    if (customerId && !debtCustomer) return <Empty title="Khách không còn trong sổ nợ" text="Khách có thể đã trả hết. Hãy quay lại sổ nợ để thêm khách hoặc chọn khách khác."><Link className="button primary" to="/debt">Về sổ nợ</Link></Empty>;
    return <><PageHeading title={debtCustomer ? `Chọn hàng cho ${debtCustomer.name}` : 'Bán hàng'} description={debtCustomer ? 'Chọn mặt hàng và đơn vị bán rồi tính tiền để cộng vào sổ nợ.' : 'Chọn hàng, chọn bán lẻ hoặc nguyên kiện và nhập số lượng.'} back={debtCustomer ? `/debt/${customerId}` : undefined}/>
        {debtCustomer && <div className="debt-order-banner"><BookOpen size={24}/><div><strong>{debtCustomer.name} · Mua chịu</strong><p>Đang nợ {formatCurrency(debtCustomer.totalDebt)} · Sau đơn này: <b>{formatCurrency(debtCustomer.totalDebt + total)}</b></p></div></div>}
        <div className="sales-layout"><section><SearchBox value={query} onChange={setQuery}/><div className="filter-tabs" aria-label="Loại hàng">{categories.map(c => <button key={c} className={category === c ? 'selected' : ''} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div><div className="list-caption">{shown.length} mặt hàng <span>Chọn đúng đơn vị khách mua</span></div><div className="products-grid">{shown.map(p => {
            const options = saleOptions(p);
            const option = options.find(o => o.key === unitChoices[p.id]) || options[0];
            const key = cartKey(p.id, option.key);
            const available = availableForOption(p, option, cart);
            return <article key={p.id} className={`product-card ${p.stock === 0 ? 'sold-out' : ''}`}><div className="product-card-top"><ProductSymbol category={p.category}/><span className={`stock-pill ${p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : ''}`}>{p.stock === 0 ? 'Hết hàng' : `Còn ${p.stock} ${p.unit}`}</span></div><h3>{p.name}</h3>
                {options.length > 1 && <label className="sale-unit-selector">Bán theo<select aria-label={`Đơn vị bán ${p.name}`} value={option.key} onChange={e => setUnitChoices({ ...unitChoices, [p.id]: e.target.value })}>{options.map(o => <option key={o.key} value={o.key}>{o.unit}{o.factor > 1 ? ` (${o.factor} ${p.unit})` : ''}</option>)}</select></label>}
                <p className="product-price">{formatCurrency(option.price)}<span> / {option.unit}</span></p>
                {cart[key] ? <Stepper value={cart[key]} max={available} label={`${p.name} (${option.unit})`} onChange={q => setQuantity(key, q, customerId)}/> : <button className="button add-button" disabled={available === 0} onClick={() => setQuantity(key, 1, customerId)}><Plus size={18}/>{p.stock === 0 ? 'Đã hết hàng' : available === 0 ? `Không đủ 1 ${option.unit}` : `Thêm ${option.unit}`}</button>}
                {options.length > 1 && <p className="unit-cart-note">{options.map(o => `${cart[cartKey(p.id, o.key)] || 0} ${o.unit}`).join(' + ')} đã chọn</p>}
            </article>;
        })}</div>{!shown.length && <Empty title="Không tìm thấy hàng" text="Thử tìm bằng tên ngắn hơn hoặc chọn nhóm khác nhé."/>}</section>
        <aside className="panel cart-preview"><div className="panel-heading"><h2><ShoppingBasket size={22}/> Giỏ hàng</h2><span className="count-badge">{selected.length}</span></div>{!selected.length ? <Empty title="Chưa chọn món nào" text="Thêm các món khách mua để bắt đầu tính tiền."/> : <><div className="mini-cart-items">{selected.map(line => <div key={line.key}><div><strong>{line.product?.name || 'Mặt hàng không còn'}</strong><span>{line.quantity} {line.option?.unit} × {formatCurrency(line.option?.price || 0)}</span></div><b>{formatCurrency(line.amount)}</b></div>)}</div><div className="cart-total"><span>Tổng cộng</span><strong>{formatCurrency(total)}</strong></div><Link className="button primary full" to={cartLink}>Xem giỏ & tính tiền <ArrowRight size={19}/></Link><p className="cart-hint">{debtCustomer ? 'Đơn hàng này mặc định ghi nợ cho khách.' : 'Kiểm tra lại trước khi nhận tiền'}</p></>}</aside></div>
        {selected.length > 0 && <div className="mobile-cart"><div><span>{selected.length} dòng hàng đã chọn</span><strong>{formatCurrency(total)}</strong></div><Link className="button primary" to={cartLink}>Xem giỏ <ArrowRight size={18}/></Link></div>}
    </>;
}
export function CartPage() {
    const { products, cart: regularCart, debtCarts, setQuantity, customers, checkout } = useShopStore();
    const [params] = useSearchParams();
    const customerId = params.get('customer');
    const debtFlow = !!customerId;
    const cart = customerId ? debtCarts[customerId] || {} : regularCart;
    const salesLink = customerId ? `/sales?customer=${customerId}` : '/sales';
    const [chosenMode, setMode] = useState('cash');
    const mode = debtFlow ? 'debt' : chosenMode;
    const [selectedCustomer, setCustomer] = useState('');
    const customer = customerId || selectedCustomer;
    const [confirm, setConfirm] = useState(false);
    const [success, setSuccess] = useState('');
    const selected = cartLines(products, cart);
    const total = selected.reduce((sum, line) => sum + line.amount, 0);
    const name = customers.find(c => c.id === customer)?.name;
    if (debtFlow && !name) return <Empty title="Khách không còn trong sổ nợ" text="Khách đã được xóa hoặc trả hết nợ. Hãy chọn lại khách."><Link className="button primary" to="/debt">Về sổ nợ</Link></Empty>;
    return <><PageHeading title={debtFlow ? `Ghi nợ cho ${name}` : 'Giỏ hàng & tính tiền'} description={debtFlow ? 'Kiểm tra món hàng và đơn vị. Tổng tiền sẽ được cộng vào sổ nợ.' : 'Kiểm tra món hàng, đơn vị và cách thanh toán.'} back={salesLink}/>
        {success ? <div className="panel success-panel"><span className="success-symbol"><Check size={38}/></span><h2>Đã ghi nhận xong!</h2><p>{success}</p><Link className="button primary" to={salesLink}>Bán đơn tiếp theo <ArrowRight size={19}/></Link><Link className="text-link" to={mode === 'debt' ? `/debt/${customer}` : '/history'}>{mode === 'debt' ? 'Xem sổ nợ của khách' : 'Xem trong lịch sử'}</Link></div> : !selected.length ? <div className="panel"><Empty title="Giỏ hàng đang trống" text="Chọn vài món hàng rồi quay lại tính tiền nhé."><Link className="button primary" to={salesLink}>Chọn hàng</Link></Empty></div> : <div className="checkout-layout"><section className="panel"><div className="panel-heading"><h2>Khách mua {selected.length} dòng hàng</h2><Link to={salesLink} className="text-link"><Plus size={18}/> Chọn thêm</Link></div>{selected.map(line => {
            const p = line.product, option = line.option;
            return <div className="cart-line" key={line.key}><ProductSymbol category={p?.category}/><div className="cart-line-name"><h3>{p?.name || 'Mặt hàng không còn'}</h3><p>{option ? `${formatCurrency(option.price)} / ${option.unit}` : 'Quy cách đã thay đổi, hãy bỏ dòng này.'}</p>{option?.factor > 1 && <p>1 {option.unit} = {option.factor} {p.unit}</p>}{p && <p>Còn: {stockDescription(p)}</p>}</div>{!line.invalid && <Stepper value={line.quantity} max={availableForOption(p, option, cart)} label={`${p.name} (${option.unit})`} onChange={q => setQuantity(line.key, q, customerId)}/>}<strong>{formatCurrency(line.amount)}</strong><button className="icon-button" aria-label={`Bỏ ${p?.name || 'mặt hàng'} ${option?.unit || ''}`} onClick={() => setQuantity(line.key, 0, customerId)}><Trash2 size={19}/></button></div>;
        })}</section><aside className="panel checkout-summary"><h2>Thanh toán</h2><div className="cart-total"><span>Tổng cộng</span><strong>{formatCurrency(total)}</strong></div>
            {debtFlow ? <div className="info-box"><BookOpen size={22}/><b> {name} mua chịu</b><p>Toàn bộ {formatCurrency(total)} được ghi vào sổ nợ.</p></div> : <div className="payment-options"><button className={mode === 'cash' ? 'selected' : ''} onClick={() => setMode('cash')}><Check size={21}/><span><b>Khách trả tiền ngay</b><small>Đã nhận đủ tiền từ khách</small></span><span className="radio-dot"/></button><button className={mode === 'debt' ? 'selected amber' : ''} onClick={() => setMode('debt')}><BookOpen size={21}/><span><b>Khách mua chịu</b><small>Ghi số tiền vào sổ nợ</small></span><span className="radio-dot"/></button></div>}
            {!debtFlow && mode === 'debt' && <label className="field">Chọn khách mua chịu<select value={customer} onChange={e => setCustomer(e.target.value)}><option value="">Chọn tên khách</option>{customers.map(c => <option value={c.id} key={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : c.note ? ` · ${c.note}` : ''}</option>)}</select><Link to="/debt?add=1&from=cart" className="text-link">+ Thêm khách mới</Link></label>}
            <button className="button primary full" disabled={(mode === 'debt' && !name) || selected.some(line => line.invalid)} onClick={() => setConfirm(true)}>{mode === 'debt' ? 'Ghi nợ cho khách' : 'Đã nhận đủ tiền'}<ArrowRight size={18}/></button><p className="cart-hint">Bán lẻ và nguyên kiện cùng trừ từ số hàng trong kho.</p>
        </aside></div>}
        {confirm && <Confirm title={mode === 'debt' ? 'Xác nhận ghi nợ' : 'Xác nhận đã nhận tiền'} onClose={() => setConfirm(false)} label={mode === 'debt' ? 'Xác nhận ghi nợ' : 'Đúng, đã nhận tiền'} onConfirm={() => { checkout(mode === 'debt' ? customer : undefined, customerId); setSuccess(mode === 'debt' ? `Đã ghi nợ ${name} ${formatCurrency(total)} và cập nhật kho.` : `Đã nhận ${formatCurrency(total)} và cập nhật kho.`); setConfirm(false); }}><p>{mode === 'debt' ? `Ghi nợ ${name} ${formatCurrency(total)}?` : `Bạn đã nhận đủ ${formatCurrency(total)} từ khách?`}</p><div className="confirm-cart-lines">{selected.map(line => <p key={line.key}>{line.quantity} {line.option?.unit} {line.product?.name} · {formatCurrency(line.amount)}</p>)}</div></Confirm>}
    </>;
}
