import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Store, ArrowRight, Eye, EyeOff, KeyRound, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { authService } from '../services/authService.js';
import { accountErrorMessage } from '../services/authMessages.js';
import { accountSession } from '../services/accountSession.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { validateNewPassword } from '../services/passwordPolicy.js';

export function ResetPasswordPage() {
    useDocumentTitle();
    const [status, setStatus] = useState('checking'); // 'checking' | 'ready' | 'expired' | 'success'
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;

        async function verifyRecoverySession() {
            if (typeof window === 'undefined') return;

            const queryParams = new URLSearchParams(window.location.search);
            const hash = window.location.hash.startsWith('#')
                ? window.location.hash.slice(1)
                : window.location.hash;
            const hashParams = new URLSearchParams(hash);

            const errorCode = queryParams.get('error_code') || hashParams.get('error_code');
            const errorParam = queryParams.get('error') || hashParams.get('error');
            const errorDesc = queryParams.get('error_description') || hashParams.get('error_description');

            if (errorCode === 'otp_expired' || errorParam === 'access_denied' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
                if (active) setStatus('expired');
                return;
            }

            const code = queryParams.get('code');

            // Wait for Supabase to initialize and process the code / token
            let session = await authService.getSession();
            if (!active) return;

            if (!session && code) {
                try {
                    session = await authService.exchangeCodeForSession(code);
                } catch {
                    for (let attempt = 0; attempt < 5; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, 350));
                        session = await authService.getSession();
                        if (!active) return;
                        if (session) break;
                    }
                }
            }

            if (session?.user) {
                if (active) setStatus('ready');
            } else {
                // Brief grace period for hash session processing
                await new Promise(resolve => setTimeout(resolve, 500));
                session = await authService.getSession();
                if (!active) return;
                if (session?.user) {
                    setStatus('ready');
                } else {
                    setStatus('expired');
                }
            }
        }

        const unsubscribe = authService.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session?.user)) {
                setStatus('ready');
            }
        });

        void verifyRecoverySession();

        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    async function submit(event) {
        event.preventDefault();
        if (busy) return;

        try {
            validateNewPassword(password);
        } catch (error) {
            setMessage(error.message);
            return;
        }

        if (password !== repeat) {
            setMessage('Hai lần nhập mật khẩu chưa giống nhau.');
            return;
        }

        setBusy(true);
        setMessage('');

        try {
            const session = await authService.getSession();
            if (!session?.user) {
                setStatus('expired');
                return;
            }
            await authService.updatePassword(password);
            await authService.signOut();
            accountSession.signedOut();
            setStatus('success');
        } catch (error) {
            const msg = (error?.message || '').toLowerCase();
            if (msg.includes('session') || msg.includes('token') || msg.includes('jwt') || msg.includes('expired') || msg.includes('auth')) {
                setStatus('expired');
                return;
            }
            setMessage(accountErrorMessage(error, 'reset'));
        } finally {
            setPassword('');
            setRepeat('');
            setBusy(false);
        }
    }

    return (
        <main className="store-setup">
            <motion.section className="panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {status === 'checking' && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div className="session-logo-badge" style={{ margin: '0 auto 16px' }}>
                            <RefreshCw size={28} className="spin" />
                        </div>
                        <h2>Đang kiểm tra liên kết…</h2>
                        <p style={{ color: 'var(--color-muted, #64748b)', fontSize: '14px', marginTop: '8px' }}>
                            Vui lòng chờ trong giây lát.
                        </p>
                    </div>
                )}

                {status === 'expired' && (
                    <div style={{ textAlign: 'center' }}>
                        <div className="session-logo-badge" style={{ background: '#fef2f2', color: '#dc2626', margin: '0 auto 16px' }}>
                            <AlertTriangle size={32} />
                        </div>
                        <h1>Liên kết đã hết hạn</h1>
                        <p style={{ color: 'var(--color-muted, #64748b)', margin: '12px 0 24px', lineHeight: 1.5 }}>
                            Liên kết đặt lại mật khẩu này đã hết hạn, đã qua sử dụng hoặc không hợp lệ. Vui lòng gửi yêu cầu mới để nhận email hướng dẫn.
                        </p>
                        <Link to="/login?mode=forgot" className="button primary full">
                            Yêu cầu liên kết mới <ArrowRight size={18} />
                        </Link>
                        <div style={{ marginTop: '16px' }}>
                            <Link to="/login" className="text-link" style={{ fontSize: '14px' }}>
                                Quay lại trang đăng nhập
                            </Link>
                        </div>
                    </div>
                )}

                {status === 'success' && (
                    <div style={{ textAlign: 'center' }}>
                        <div className="session-logo-badge" style={{ background: '#ecfdf5', color: '#059669', margin: '0 auto 16px' }}>
                            <CheckCircle2 size={32} />
                        </div>
                        <h1>Đặt lại mật khẩu thành công!</h1>
                        <p style={{ color: 'var(--color-muted, #64748b)', margin: '12px 0 24px', lineHeight: 1.5 }}>
                            Mật khẩu của bạn đã được cập nhật thành công. Hãy dùng mật khẩu mới để đăng nhập vào cửa hàng.
                        </p>
                        <Link to="/login" className="button primary full">
                            Đăng nhập ngay <ArrowRight size={18} />
                        </Link>
                    </div>
                )}

                {status === 'ready' && (
                    <>
                        <div className="session-logo-badge">
                            <KeyRound size={30} />
                        </div>
                        <h1>Đặt mật khẩu mới</h1>
                        <p>Mật khẩu mới cần 8–72 byte, có chữ và số.</p>

                        <form onSubmit={submit}>
                            <label className="field">
                                <span>Mật khẩu mới</span>
                                <div className="password-field">
                                    <input
                                        required
                                        type={show ? 'text' : 'password'}
                                        minLength={8}
                                        maxLength={72}
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={event => setPassword(event.target.value)}
                                        placeholder="Ít nhất 8 ký tự, có chữ và số"
                                    />
                                    <button
                                        type="button"
                                        className="icon-button"
                                        aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                                        onClick={() => setShow(!show)}
                                    >
                                        {show ? <EyeOff size={20} /> : <Eye size={20} />}
                                    </button>
                                </div>
                            </label>

                            <label className="field">
                                <span>Nhập lại mật khẩu</span>
                                <div className="password-field">
                                    <input
                                        required
                                        type={show ? 'text' : 'password'}
                                        minLength={8}
                                        maxLength={72}
                                        autoComplete="new-password"
                                        value={repeat}
                                        onChange={event => setRepeat(event.target.value)}
                                        placeholder="Nhập lại mật khẩu mới"
                                    />
                                </div>
                            </label>

                            {message && <p className="error" role="alert">{message}</p>}

                            <button className="button primary full" disabled={busy}>
                                {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'} <ArrowRight size={18} />
                            </button>
                        </form>
                    </>
                )}

                <div className="sidebar-signoff" style={{ marginTop: '24px' }}>
                    <Store size={15}/> Bảo mật tài khoản BIN
                </div>
            </motion.section>
        </main>
    );
}
