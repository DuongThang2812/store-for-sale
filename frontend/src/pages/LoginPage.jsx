import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Leaf, Store, CheckCircle2, ShieldCheck } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { authService } from '../services/authService.js';
import { accountSession } from '../services/accountSession.js';
import { accountErrorMessage } from '../services/authMessages.js';
import { getSupabaseConfigurationStatus } from '../lib/supabase.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { StaggerContainer, StaggerItem } from '../components/motion/MotionPrimitives.jsx';
import { validateNewPassword } from '../services/passwordPolicy.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
        </svg>
    );
}

function getInitialRecoveryError() {
    if (typeof window === 'undefined') return '';
    const queryParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const errorCode = queryParams.get('error_code') || hashParams.get('error_code');
    const errorParam = queryParams.get('error') || hashParams.get('error');
    const errorDesc = queryParams.get('error_description') || hashParams.get('error_description');

    if (errorCode === 'otp_expired' || errorParam === 'access_denied' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
        return 'Liên kết đặt lại mật khẩu đã hết hạn hoặc không còn hiệu lực. Vui lòng nhập email bên dưới để nhận liên kết mới.';
    }
    return '';
}

export function LoginPage({ initialMode = 'login' }) {
    useDocumentTitle();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const afterLogin = params.get('next') === 'admin' ? '/admin' : '/';
    const queryMode = params.get('mode');
    const initialRecoveryError = getInitialRecoveryError();
    const initial = initialRecoveryError || queryMode === 'forgot'
        ? 'forgot'
        : queryMode === 'register' || initialMode === 'register'
            ? 'register'
            : 'login';
    const [mode, setMode] = useState(initial);
    const [show, setShow] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [message, setMessage] = useState(initialRecoveryError);
    const [busy, setBusy] = useState(false);
    const [googleBusy, setGoogleBusy] = useState(false);
    const [googleError, setGoogleError] = useState('');
    const configuration = getSupabaseConfigurationStatus();

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const queryParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;
        const hashParams = new URLSearchParams(hash);

        // 1. Detect if recovery token landed on /login (e.g. link without redirect_to)
        const type = queryParams.get('type') || hashParams.get('type');
        if (type === 'recovery') {
            navigate('/reset-password' + (window.location.hash || ''), { replace: true });
            return;
        }

        // 2. Clean hash if expired error was present in hash
        const errorCode = queryParams.get('error_code') || hashParams.get('error_code');
        const errorParam = queryParams.get('error') || hashParams.get('error');
        const errorDesc = queryParams.get('error_description') || hashParams.get('error_description');
        if ((errorCode === 'otp_expired' || errorParam === 'access_denied' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) && window.location.hash) {
            window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
    }, [navigate]);

    function switchMode(next) {
        setMode(next);
        setMessage('');
        setGoogleError('');
        setPassword('');
        setRepeat('');
    }

    async function handleGoogleSignIn() {
        if (busy || googleBusy || !configuration.configured) return;
        setGoogleBusy(true);
        setGoogleError('');
        setMessage('');
        try {
            await authService.signInWithGoogle();
        } catch (error) {
            setGoogleError(accountErrorMessage(error, 'oauth'));
            setGoogleBusy(false);
        }
    }

    async function submit(event) {
        event.preventDefault();
        if (busy || !configuration.configured) return;
        const normalized = email.trim().toLowerCase();
        if (!emailPattern.test(normalized)) { setMessage('Vui lòng nhập email đúng định dạng.'); return; }
        if (mode === 'register' && (!name.trim() || name.trim().length > 120)) { setMessage('Vui lòng nhập tên của bạn.'); return; }
        if (mode === 'register') {
            try { validateNewPassword(password); }
            catch (error) { setMessage(error.message); return; }
        }
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
        } catch (error) {
            if (mode === 'forgot') {
                const status = error?.status || error?.statusCode;
                const msg = (error?.message || '').toLowerCase();
                const code = error?.code || '';
                if (status === 429 || code === 'over_email_send_rate_limit' || msg.includes('rate') || msg.includes('once every') || msg.includes('too many')) {
                    setMessage('Bạn đã yêu cầu gửi email quá nhiều lần. Vì lý do an toàn, vui lòng chờ 1–2 phút rồi thử lại.');
                } else if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) {
                    setMessage('Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra kết nối mạng và thử lại.');
                } else {
                    setMessage(accountErrorMessage(error, 'reset'));
                }
            } else {
                setMessage(accountErrorMessage(error, mode === 'register' ? 'signup' : 'login'));
            }
        }
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
                <StaggerContainer>
                    <StaggerItem>
                        <span className="eyebrow"><Leaf size={18}/> DÀNH CHO TIỆM NHỎ CỦA BẠN</span>
                        <h1>Nhẹ việc tiệm.<br/>Vui mỗi ngày.</h1>
                        <p>Bán hàng, quản lý kho và ghi sổ nợ.<br/>Mọi việc gọn gàng, minh bạch ở một nơi.</p>
                    </StaggerItem>
                    <div className="login-features">
                        <StaggerItem className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Bán hàng siêu nhanh, hỗ trợ bán lẻ, bán thùng và cân kg</span>
                        </StaggerItem>
                        <StaggerItem className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Sổ nợ rõ ràng, ghi nhớ chi tiết từng khách mua chịu</span>
                        </StaggerItem>
                        <StaggerItem className="login-feature-item">
                            <span className="login-feature-icon"><CheckCircle2 size={16}/></span>
                            <span>Tồn kho chính xác, cảnh báo kịp thời khi hàng sắp hết</span>
                        </StaggerItem>
                    </div>
                </StaggerContainer>
                <span><ShieldCheck size={18}/> Tài khoản được bảo vệ bằng Supabase Auth</span>
            </section>

            <section className="login-form">
                <div>
                    <div className="mobile-login-logo">
                        <span className="brand-icon"><Store size={24}/></span>
                        <span>Tạp hóa <strong>BIN.</strong></span>
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={mode}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                        >
                            <h1>{mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Quên mật khẩu?'}</h1>
                            <p>{mode === 'forgot' ? 'Nhập email để nhận hướng dẫn đặt lại mật khẩu.' : 'Mở cửa hàng của bạn để bắt đầu làm việc.'}</p>
                        </motion.div>
                    </AnimatePresence>

                    {!configuration.configured && (
                        <div className="info-box" role="alert">
                            Ứng dụng chưa kết nối Supabase. Hãy điền URL và publishable/anon key vào <code>.env.local</code>, rồi khởi động lại web.
                        </div>
                    )}

                    {mode !== 'forgot' && (
                        <div className="filter-tabs" aria-label="Chọn cách vào cửa hàng">
                            <button type="button" className={mode === 'login' ? 'selected' : ''} disabled={busy || googleBusy} onClick={() => switchMode('login')}>
                                Đăng nhập
                            </button>
                            <button type="button" className={mode === 'register' ? 'selected' : ''} disabled={busy || googleBusy} onClick={() => switchMode('register')}>
                                Đăng ký
                            </button>
                        </div>
                    )}

                    {mode !== 'forgot' && (
                        <div className="google-auth-section">
                            <button
                                type="button"
                                className="google-auth-btn"
                                disabled={busy || googleBusy || !configuration.configured}
                                onClick={handleGoogleSignIn}
                                aria-label={mode === 'register' ? 'Đăng ký bằng Google' : 'Đăng nhập bằng Google'}
                            >
                                <GoogleIcon />
                                <span>
                                    {googleBusy
                                        ? 'Đang chuyển đến Google…'
                                        : mode === 'register'
                                            ? 'Đăng ký bằng Google'
                                            : 'Đăng nhập bằng Google'}
                                </span>
                            </button>
                            {googleError && (
                                <p className="error" role="alert" style={{ marginTop: '8px' }}>
                                    {googleError}
                                </p>
                            )}
                            <div className="auth-divider">
                                <span>hoặc với email</span>
                            </div>
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
                                    <input required minLength={mode === 'register' ? 8 : undefined} maxLength={mode === 'register' ? 72 : 100} type={show ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? '8–72 byte, có chữ và số' : 'Nhập mật khẩu'}/>
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
                                    <input required maxLength={72} type={show ? 'text' : 'password'} autoComplete="new-password" value={repeat} onChange={event => setRepeat(event.target.value)} placeholder="Nhập lại mật khẩu"/>
                                </div>
                            </label>
                        )}
                        {message && (
                            <p className={message.startsWith('Nếu email') || message.startsWith('Vui lòng kiểm tra email') ? 'info-box' : 'error'} role="status">
                                {message}
                            </p>
                        )}
                        <button type="submit" disabled={busy || googleBusy || !configuration.configured} className="button primary full">
                            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : mode === 'register' ? 'Tạo tài khoản' : 'Gửi hướng dẫn'} <ArrowRight size={19}/>
                        </button>
                    </form>
                    <button type="button" className="text-link login-mode-link" disabled={busy || googleBusy} onClick={() => switchMode(mode === 'forgot' ? 'login' : 'forgot')}>
                        {mode === 'forgot' ? 'Quay lại đăng nhập' : 'Quên mật khẩu?'}
                    </button>
                </div>
            </section>
        </div>
    );
}
