import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Leaf, Store } from 'lucide-react';
import { openDemoAccount } from '../services/accountService';
export function LoginPage() {
    const navigate = useNavigate();
    const [mode, setMode] = useState('login');
    const [show, setShow] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    function enter(demo = false) {
        if (busy) return;
        if (!demo && mode === 'register' && password !== repeat) { setMessage('Hai lần nhập mật khẩu mẫu chưa giống nhau.'); return; }
        setBusy(true); setMessage('');
        try { openDemoAccount(demo ? '' : email, demo ? '' : name); setPassword(''); setRepeat(''); navigate('/', { replace: true }); }
        catch (e) { setMessage(e.message); setBusy(false); }
    }
    return <div className="login-page"><section className="login-story"><div className="brand"><span className="brand-icon"><Store size={30}/></span><span>Tạp hóa<strong>Nhà Mình.</strong></span></div><div><span className="eyebrow"><Leaf size={20}/> DÀNH CHO TIỆM NHỎ CỦA BẠN</span><h1>Nhẹ việc tiệm.<br/>Vui mỗi ngày.</h1><p>Bán hàng, quản lý kho và ghi sổ nợ.<br/>Mọi việc gọn gàng ở một nơi.</p><div className="store-illustration" aria-hidden="true"><Store size={180} strokeWidth={1}/></div></div><span>Giao diện mẫu · Chưa kết nối tài khoản thật</span></section><section className="login-form"><div><div className="mobile-login-logo"><Store size={30}/> Tạp hóa Nhà Mình</div><h1>{mode === 'login' ? 'Chào bạn trở lại!' : 'Mở tiệm của bạn'}</h1><p>{mode === 'login' ? 'Làm quen với màn hình đăng nhập.' : 'Điền thông tin để xem thử luồng đăng ký.'}</p><div className="filter-tabs" aria-label="Chọn màn hình tài khoản"><button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setMessage(''); }}>Đăng nhập</button><button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setMessage(''); }}>Đăng ký</button></div><div className="info-box">Đây là giao diện thử. Email chỉ dùng để tách dữ liệu mẫu trên máy này; chưa xác thực hay lưu trực tuyến. Mật khẩu mẫu không được lưu hoặc gửi đi.</div><form onSubmit={e => { e.preventDefault(); enter(); }}>{mode === 'register' && <label className="field">Tên cửa hàng<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Tạp hóa BIN"/></label>}<label className="field">Email mẫu<input required type="email" autoComplete="off" value={email} maxLength={160} onChange={e => setEmail(e.target.value)} placeholder="cuahang@example.com"/></label><label className="field">Mật khẩu mẫu<div className="password-field"><input required autoComplete="off" minLength={8} maxLength={100} type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Ít nhất 8 ký tự để thử giao diện"/><button type="button" className="icon-button" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>{show ? <EyeOff size={21}/> : <Eye size={21}/>}</button></div></label>{mode === 'register' && <label className="field">Nhập lại mật khẩu mẫu<input required autoComplete="off" type={show ? 'text' : 'password'} value={repeat} onChange={e => setRepeat(e.target.value)} placeholder="Nhập lại mật khẩu mẫu"/></label>}{message && <p className="error" role="alert">{message}</p>}<button type="submit" disabled={busy} className="button primary full">{busy ? 'Đang mở…' : mode === 'login' ? 'Đăng nhập thử' : 'Tạo cửa hàng mẫu'} <ArrowRight size={19}/></button></form><div className="login-divider">Hoặc dùng dữ liệu mẫu có sẵn</div><button disabled={busy} className="button secondary full" onClick={() => enter(true)}>Mở cửa hàng dùng thử <ArrowRight size={19}/></button><p className="cart-hint">Dữ liệu thật sẽ được kết nối ở bước làm backend.</p></div></section></div>;
}
