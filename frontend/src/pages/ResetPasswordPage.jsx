import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ArrowRight, Eye, EyeOff, KeyRound } from 'lucide-react';
import { motion } from 'motion/react';
import { authService } from '../services/authService.js';
import { accountErrorMessage } from '../services/authMessages.js';
import { accountSession } from '../services/accountSession.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function ResetPasswordPage() {
    useDocumentTitle();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [repeat, setRepeat] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    async function submit(event) {
        event.preventDefault();
        if (busy) return;
        if (password !== repeat) { setMessage('Hai lần nhập mật khẩu chưa giống nhau.'); return; }
        setBusy(true); setMessage('');
        try {
            const session = await authService.getSession();
            if (!session) throw new Error('No recovery session');
            await authService.updatePassword(password);
            await authService.signOut();
            accountSession.signedOut();
            navigate('/login', { replace: true });
        } catch (error) { setMessage(accountErrorMessage(error, 'reset')); }
        finally { setPassword(''); setRepeat(''); setBusy(false); }
    }

    return (
        <main className="store-setup">
            <motion.section className="panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
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
                                placeholder="Ít nhất 8 ký tự"
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
                <div className="sidebar-signoff">
                    <Store size={15}/> Bảo mật tài khoản BIN
                </div>
            </motion.section>
        </main>
    );
}
