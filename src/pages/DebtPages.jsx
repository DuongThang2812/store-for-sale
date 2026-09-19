import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ChevronRight, Download, Phone, Plus, Users, Wallet } from 'lucide-react';
import { useShopStore } from '../stores/useShopStore';
import { ActivityList, Confirm, Empty, Modal, Notice, PageHeading, SearchBox } from '../components/ui';
import { exportCsv, matches } from '../utils/shopHelpers';
import { SaleCancellationDialog } from '../components/SaleCancellationDialog';
import { formatCurrency, formatDate } from '../utils/formatters';
export function DebtPage() {
    const creating = useRef(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { customers, addCustomer } = useShopStore();
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(params.has('add'));
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [note, setNote] = useState('');
    const [success, setSuccess] = useState(location.state?.message || '');
    const [error, setError] = useState('');
    const shown = customers.filter(c => matches(`${c.name} ${c.phone || ''} ${c.note || ''}`, query));
    const total = customers.reduce((s, c) => s + c.totalDebt, 0);
    function close() { setAdding(false); setParams({}); }
    return <><PageHeading title="Sổ nợ" description="Ghi nhớ giúp bạn từng khoản khách chưa trả."
     action={<button className="button primary" onClick={() => setAdding(true)}><Plus size={20} /> 
     Thêm khách</button>} />{success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}
     <div className="debt-overview"><span className="choice-icon orange"><BookOpen size={31} /></span>
     <div><p>Tổng tiền khách chưa trả</p><h2>{formatCurrency(total)}</h2></div><span><Users size={20} /> {customers.filter(c => c.totalDebt > 0).length} khách còn nợ</span></div><div className="inventory-tools"><SearchBox value={query} onChange={setQuery} placeholder="Tìm tên hoặc số điện thoại khách…" /><button className="button secondary" onClick={() => exportCsv('so-no.csv', [['Tên khách', 'Điện thoại', 'Ghi chú', 'Còn nợ'], ...customers.map(c => [c.name, c.phone || '', c.note || '', c.totalDebt])])}><Download size={19} /> Tải sổ nợ</button></div><div className="customer-grid">{shown.map((c, i) => <Link to={`/debt/${c.id}`} className="panel customer-card" key={c.id}><div className="customer-top"><span className={`customer-avatar avatar-${i % 4}`}>{c.name.split(' ').slice(-1)[0].slice(0, 1)}</span><div><h2>{c.name}</h2><p>{c.phone || c.note || 'Chưa thêm số điện thoại'}</p></div><ChevronRight size={21} /></div><div className="customer-bottom"><div><span>{c.totalDebt > 0 ? 'Còn nợ' : 'Chưa ghi món hàng'}</span><strong className={c.totalDebt > 0 ? 'text-amber' : 'text-green'}>{formatCurrency(c.totalDebt)}</strong></div><span>Xem sổ <ArrowRight size={17} /></span></div></Link>)}</div>{!shown.length && <Empty title="Chưa tìm thấy khách" text="Thử tên khác hoặc thêm khách mới để ghi nợ." />}{adding && <Modal title="Thêm khách vào sổ" onClose={close}><form onSubmit={e => {
        e.preventDefault();
        if (creating.current) return;
        creating.current = true;
        try {
            const customerId = addCustomer(name, phone, note, params.get('from') === 'cart');
            navigate(`/sales?customer=${customerId}`);
            setSuccess(`Đã thêm ${name} vào sổ khách.`);
            setName('');
            setPhone('');
            setNote('');
            setAdding(false);
        }
            catch (e) {
                creating.current = false;
                setError(e.message);
            }
    }}><p className="muted">Nhập tên rồi nhấn Enter để chọn hàng cho khách mua chịu.</p><label className="field">Tên hoặc biệt danh *<input required autoFocus maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Cô Lan đầu hẻm" /></label><label className="field">Số điện thoại <small>(không bắt buộc)</small><input type="tel" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} placeholder="Ví dụ: 0901 234 567" /></label><label className="field">Ghi chú nhận biết <small>(không bắt buộc)</small><input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="Ví dụ: Nhà đối diện tiệm" /></label>{error && <p className="error">{error}</p>}<button type="submit" className="button primary full"><ArrowRight size={19} /> Thêm khách & chọn hàng</button></form></Modal>}</>;
}
export function CustomerPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const { customers, entries, payDebt } = useShopStore();
    const c = customers.find(c => c.id === id);
    const [paying, setPaying] = useState(false);
    const [amount, setAmount] = useState('');
    const [confirm, setConfirm] = useState(false);
    const [success, setSuccess] = useState(location.state?.message || '');
    if (!c)
        return <Empty title="Không tìm thấy khách" text="Bạn quay về sổ nợ để chọn lại nhé."><Link to="/debt" className="button primary">Về sổ nợ</Link></Empty>;
    const valid = Number.isSafeInteger(Number(amount)) && Number(amount) > 0 && Number(amount) <= c.totalDebt;
    return <><PageHeading title={c.name} description={c.note || 'Thông tin ghi nợ và các lần khách trả tiền.'} back="/debt" />{success && <Notice onClose={() => setSuccess('')}>{success}</Notice>}<div className="customer-detail-layout"><section><div className="debt-overview customer-balance"><span className="choice-icon orange"><BookOpen size={31} /></span><div><p>Số tiền còn nợ</p><h2>{formatCurrency(c.totalDebt)}</h2></div></div><section className="panel"><div className="panel-heading"><h2>Lịch sử mua thiếu & trả tiền</h2></div><ActivityList entries={entries.filter(e => e.customerId === c.id)} /></section></section><aside className="panel customer-actions"><h2>Thông tin khách</h2><p><Phone size={18} />{c.phone || 'Chưa thêm số điện thoại'}</p><p className="muted">Lần gần nhất: {formatDate(c.lastTransactionAt) || 'Chưa có giao dịch mới'}</p><button className="button primary full" disabled={c.totalDebt === 0} onClick={() => setPaying(true)}><Wallet size={20} /> Nhận tiền trả nợ</button><Link className="button secondary full" to={`/sales?customer=${c.id}`}><Plus size={19} /> Bán hàng & ghi nợ</Link><p className="cart-hint">Mỗi lần nhận tiền đều được ghi lại để dễ đối chiếu.</p></aside></div>{paying && !confirm && <Modal title={`Nhận tiền từ ${c.name}`} onClose={() => setPaying(false)}><p className="muted">Hiện còn nợ <b>{formatCurrency(c.totalDebt)}</b></p><button className="button secondary full" onClick={() => setAmount(String(c.totalDebt))}><Check size={19} /> Trả hết {formatCurrency(c.totalDebt)}</button><label className="field">Hoặc nhập số tiền khách trả<div className="input-unit"><input type="number" inputMode="numeric" min="1" max={c.totalDebt} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ví dụ: 50000" /><span>đ</span></div></label>{amount && !valid && <p className="error" role="alert">Nhập số tiền lớn hơn 0 và không vượt quá số nợ.</p>}<div className="repayment-preview"><span>Sau khi trả còn nợ</span><strong>{formatCurrency(valid ? c.totalDebt - Number(amount) : c.totalDebt)}</strong></div><button className="button primary full" disabled={!valid} onClick={() => setConfirm(true)}>Xác nhận đã nhận <ArrowRight size={18} /></button></Modal>}{confirm && <Confirm title="Xác nhận nhận tiền trả nợ" onClose={() => setConfirm(false)} label="Đúng, đã nhận tiền" onConfirm={() => { const remaining = payDebt(c.id, Number(amount)); if (remaining === 0) { navigate('/debt', { replace: true, state: { message: `${c.name} đã trả hết ${formatCurrency(Number(amount))}. Đã xóa khách khỏi sổ nợ.` } }); } else { setSuccess(`Đã nhận ${formatCurrency(Number(amount))}. ${c.name} còn nợ ${formatCurrency(remaining)}.`); } setPaying(false); setConfirm(false); setAmount(''); }}><p>Bạn đã nhận <b>{formatCurrency(Number(amount))}</b> từ <b>{c.name}</b>?</p><p>{Number(amount) === c.totalDebt ? "Khách sẽ được xóa khỏi sổ nợ sau khi trả hết. Lịch sử thu tiền vẫn được lưu." : `Sau khi trả còn nợ ${formatCurrency(c.totalDebt - Number(amount))}.`}</p></Confirm>}</>;
}
export function HistoryPage() {
    const [cancelling, setCancelling] = useState(null);
    const [notice, setNotice] = useState('');
    const entries = useShopStore(s => s.entries);
    const [filter, setFilter] = useState('all');
    return <><PageHeading title="Lịch sử hoạt động" description="Xem lại giao dịch hoặc hủy toàn bộ đơn bán nhầm để hoàn hàng vào kho." />{notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}<div className="filter-tabs">{[{ id: 'all', text: 'Tất cả' }, { id: 'sale', text: 'Bán hàng' }, { id: 'stock', text: 'Nhập hàng' }, { id: 'debt', text: 'Ghi nợ' }, { id: 'payment', text: 'Trả nợ' }, { id: 'edit', text: 'Sửa hàng' }, { id: 'cancel', text: 'Đơn đã hủy' }, { id: 'restore', text: 'Khôi phục' }].map(f => <button className={filter === f.id ? 'selected' : ''} aria-pressed={filter === f.id} key={f.id} onClick={() => setFilter(f.id)}>{f.text}</button>)}</div><section className="panel"><ActivityList entries={entries.filter(e => filter === 'all' || e.kind === filter)} onCancelSale={setCancelling}/></section>{cancelling && <SaleCancellationDialog saleId={cancelling} onClose={() => setCancelling(null)} onDone={message => { setNotice(message); setCancelling(null); }}/>}</>;
}
