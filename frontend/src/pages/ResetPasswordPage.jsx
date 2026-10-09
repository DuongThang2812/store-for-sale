import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store, ArrowRight, Eye, EyeOff } from 'lucide-react';
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
            <section className="panel">
                <div className="session-logo-badge" style={{ margin: '0 auto 12px' }}>
                    <Store size={32} />
                </div>
                <h1>Đặt mật khẩu mới</h1>
                <p>Mật khẩu mới cần ít nhất 8 ký tự, bao gồm cả chữ và số.</p>

                <form onSubmit={submit}>
                    <label className="field">
                        <span>Mật khẩu mới</span>
                        <div className="password-field">
                            <input
                                required
                                type={show ? 'text' : 'password'}
                                minLength={8}
                                maxLength={100}
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
                                maxLength={100}
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
            </section>
        </main>
    );
}
