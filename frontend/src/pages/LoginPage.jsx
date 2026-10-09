import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Leaf, Store, CheckCircle2, ShieldCheck } from 'lucide-react';
import { authService } from '../services/authService.js';
import { accountSession } from '../services/accountSession.js';
import { accountErrorMessage } from '../services/authMessages.js';
import { getSupabaseConfigurationStatus } from '../lib/supabase.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const strongPassword = value => value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);

export function LoginPage() {
    useDocumentTitle();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const afterLogin = params.get('next') === 'admin' ? '/admin' : '/';
    const [mode, setMode] = useState('login');
    const [show, setShow] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const configuration = getSupabaseConfigurationStatus();

    function switchMode(next) { setMode(next); setMessage(''); setPassword(''); setRepeat(''); }

    async function submit(event) {
        event.preventDefault();
        if (busy || !configuration.configured) return;
        const normalized = email.trim().toLowerCase();
        if (!emailPattern.test(normalized)) { setMessage('Vui lòng nhập email đúng định dạng.'); return; }
        if (mode === 'register' && (!name.trim() || name.trim().length > 120)) { setMessage('Vui lòng nhập tên của bạn.'); return; }
        if (mode === 'register' && !strongPassword(password)) { setMessage('Mật khẩu cần ít nhất 8 ký tự, có chữ và số.'); return; }
        if (mode === 'register' && password !== repeat) { setMessage('Hai lần nhập mật khẩu chưa giống nhau.'); return; }
        if (mode === 'login' && !password) { setMessage('Vui lòng nhập mật khẩu.'); return; }
        setBusy(true); setMessage('');
        try {
            if (mode === 'forgot') {
                await authService.requestPasswordReset(normalized, `${window.location.origin}/reset-password`);
                setMessage('Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu sẽ được gửi.');
            } else if (mode === 'register') {
                const response = await authService.signUp({ email: normalized, password, name: name.trim(), emailRedirectTo: `${window.location.origin}/login` });
                if (response.requiresEmailConfirmation) setMessage('Vui lòng kiểm tra email để xác nhận tài khoản, rồi đăng nhập.');
                else { await accountSession.refresh(); navigate(afterLogin, { replace: true }); }
            } else {
                await authService.signIn({ email: normalized, password });
                await accountSession.refresh();
                if (!useAccountStore.getState().user) throw new Error('Account context unavailable');
                navigate(afterLogin, { replace: true });
            }
        } catch (error) { setMessage(mode === 'forgot' ? 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu sẽ được gửi.' : accountErrorMessage(error, mode === 'register' ? 'signup' : 'login')); }
        finally { setPassword(''); setRepeat(''); setBusy(false); }
    }

    return (
        <div className="login-page">
            <section className="login-story">
                <div className="login-ambient" aria-hidden="true">
                    <div className="login-ambient-orb"/>
                    <div className="login-ambient-orb"/>
                    <div className="login-ambient-orb"/>
                </div>
                <div className="login-grid-overlay" aria-hidden="true"/>
                <div className="brand">
                    <span className="brand-icon"><Store size={30}/></span>
                    <span>Tạp hóa<strong>BIN.</strong></span>
                </div>
                <div>
                    <span className="eyebrow"><Leaf size={18}/> DÀNH CHO TIỆM NHỎ CỦA BẠN</span>
                    <h1>Nhẹ việc tiệm.<br/>Vui mỗi ngày.</h1>
                    <p>Bán hàng, quản lý kho và ghi sổ nợ.<br/>Mọi việc gọn gàng, minh bạch ở một nơi.</p>
                    <div className="login-features">
                        <div className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Bán hàng siêu nhanh, hỗ trợ bán lẻ, bán thùng và cân kg</span>
                        </div>
                        <div className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Sổ nợ rõ ràng, ghi nhớ chi tiết từng khách mua chịu</span>
                        </div>
                        <div className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Tồn kho chính xác, cảnh báo kịp thời khi hàng sắp hết</span>
                        </div>
                    </div>
                </div>
                <span><ShieldCheck size={18}/> Tài khoản được bảo vệ bằng Supabase Auth</span>
            </section>

            <section className="login-form">
                <div>
                    <div className="mobile-login-logo">
                        <span className="brand-icon"><Store size={24}/></span>
                        <span>Tạp hóa <strong>BIN.</strong></span>
                    </div>
                    <h1>{mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Quên mật khẩu?'}</h1>
                    <p>{mode === 'forgot' ? 'Nhập email để nhận hướng dẫn đặt lại mật khẩu.' : 'Mở cửa hàng của bạn để bắt đầu làm việc.'}</p>

                    {!configuration.configured && (
                        <div className="info-box" role="alert">
                            Ứng dụng chưa kết nối Supabase. Hãy điền URL và publishable/anon key vào <code>.env.local</code>, rồi khởi động lại web.
                        </div>
                    )}

                    {mode !== 'forgot' && (
                        <div className="filter-tabs" aria-label="Chọn cách vào cửa hàng">
                            <button type="button" className={mode === 'login' ? 'selected' : ''} disabled={busy} onClick={() => switchMode('login')}>
                                Đăng nhập
                            </button>
                            <button type="button" className={mode === 'register' ? 'selected' : ''} disabled={busy} onClick={() => switchMode('register')}>
                                Đăng ký
                            </button>
                        </div>
                    )}

                    <form onSubmit={submit}>
                        {mode === 'register' && (
                            <label className="field">
                                <span>Tên của bạn</span>
                                <input required maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Chủ tiệm BIN"/>
                            </label>
                        )}
                        <label className="field">
                            <span>Email</span>
                            <input required type="email" autoComplete="username" maxLength={160} value={email} onChange={event => setEmail(event.target.value)} placeholder="cuahang@example.com"/>
                        </label>
                        {mode !== 'forgot' && (
                            <label className="field">
                                <span>Mật khẩu</span>
                                <div className="password-field">
                                    <input required minLength={mode === 'register' ? 8 : undefined} maxLength={100} type={show ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'Ít nhất 8 ký tự, có chữ và số' : 'Nhập mật khẩu'}/>
                                    <button type="button" className="icon-button" aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShow(!show)}>
                                        {show ? <EyeOff size={20}/> : <Eye size={20}/>}
                                    </button>
                                </div>
                            </label>
                        )}
                        {mode === 'register' && (
                            <label className="field">
                                <span>Nhập lại mật khẩu</span>
                                <div className="password-field">
                                    <input required maxLength={100} type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} placeholder="Nhập lại mật khẩu"/>
                                </div>
                            </label>
                        )}
                        {message && (
                            <p className={message.startsWith('Nếu email') || message.startsWith('Vui lòng kiểm tra email') ? 'info-box' : 'error'} role="status">
                                {message}
                            </p>
                        )}
                        <button type="submit" disabled={busy || !configuration.configured} className="button primary full">
                            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Gửi hướng dẫn'} <ArrowRight size={19}/>
                        </button>
                    </form>
                    <button type="button" className="text-link login-mode-link" disabled={busy} onClick={() => switchMode(mode === 'forgot' ? 'login' : 'forgot')}>
                        {mode === 'forgot' ? 'Quay lại đăng nhập' : 'Quên mật khẩu?'}
                    </button>
                </div>
            </section>
        </div>
    );
}
