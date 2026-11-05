import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Store, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { authService } from '../services/authService.js';
import { accountSession } from '../services/accountSession.js';
import { useAccountStore } from '../stores/useAccountStore.js';
import { accountErrorMessage } from '../services/authMessages.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function AuthCallbackPage() {
    useDocumentTitle();
    const navigate = useNavigate();
    const [status, setStatus] = useState('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const processedRef = useRef(false);

    useEffect(() => {
        // Prevent double execution in React Strict Mode
        if (processedRef.current) return;
        processedRef.current = true;

        let active = true;

        async function handleCallback() {
            try {
                // 1. Inspect URL parameters for OAuth errors
                const queryParams = new URLSearchParams(window.location.search);
                const hash = window.location.hash.startsWith('#')
                    ? window.location.hash.slice(1)
                    : window.location.hash;
                const hashParams = new URLSearchParams(hash);

                const errorParam = queryParams.get('error') || hashParams.get('error');
                const errorDescription = queryParams.get('error_description') || hashParams.get('error_description');

                if (errorParam) {
                    let friendly = 'Đăng nhập bằng Google không thành công. Vui lòng thử lại.';
                    const lowerErr = `${errorParam} ${errorDescription || ''}`.toLowerCase();
                    if (errorParam === 'access_denied' || lowerErr.includes('denied') || lowerErr.includes('cancel')) {
                        friendly = 'Bạn đã hủy đăng nhập bằng Google. Vui lòng thử lại khi sẵn sàng.';
                    } else if (errorDescription) {
                        friendly = errorDescription;
                    }
                    if (active) {
                        setStatus('error');
                        setErrorMessage(friendly);
                    }
                    return;
                }

                const code = queryParams.get('code');

                // 2. Wait for Supabase client to exchange the auth code.
                // Because detectSessionInUrl: true is configured, the Supabase client
                // automatically exchanges PKCE code for session in _initialize().
                // authService.getSession() awaits that initialize promise.
                let session = await authService.getSession();

                // If code is present in URL but session not ready yet, retry briefly
                if (!session && code) {
                    for (let attempt = 0; attempt < 5; attempt++) {
                        await new Promise(resolve => setTimeout(resolve, 350));
                        session = await authService.getSession();
                        if (session) break;
                    }
                }

                if (!session?.user) {
                    if (code) {
                        throw new Error('Mã xác thực không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.');
                    }
                    throw new Error('Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.');
                }

                // 3. Confirm verified server-side identity
                const user = await authService.getUser();
                if (!user || user.id !== session.user.id) {
                    throw new Error('Không thể xác thực danh tính người dùng. Vui lòng đăng nhập lại.');
                }

                // 4. Refresh account data (loads profile and stores idempotently)
                await accountSession.refresh();

                if (!active) return;

                const accountState = useAccountStore.getState();
                if (accountState.error) {
                    throw new Error(accountState.error);
                }

                // 5. Navigate to /setup (store selection or creation)
                // /setup renders "Tạo cửa hàng của bạn" if stores.length === 0,
                // and "Chọn cửa hàng" if stores.length > 0.
                navigate('/setup', { replace: true });
            } catch (err) {
                if (!active) return;
                setStatus('error');
                setErrorMessage(accountErrorMessage(err, 'oauth'));
            }
        }

        void handleCallback();

        return () => {
            active = false;
        };
    }, [navigate]);

    if (status === 'error') {
        return (
            <main className="store-setup">
                <section className="panel" role="alert">
                    <div className="session-logo-badge" style={{ background: 'var(--red, #e11d48)' }}>
                        <AlertTriangle size={32} />
                    </div>
                    <h1>Đăng nhập không thành công</h1>
                    <p className="error">{errorMessage}</p>
                    <div style={{ display: 'grid', gap: '10px', marginTop: '20px' }}>
                        <Link to="/login" className="button primary full">
                            Quay lại trang đăng nhập <ArrowRight size={18} />
                        </Link>
                        <button
                            type="button"
                            className="button secondary full"
                            onClick={() => {
                                window.location.reload();
                            }}
                        >
                            <RefreshCw size={18} /> Thử lại
                        </button>
                    </div>
                </section>
            </main>
        );
    }

    return (
        <div className="session-loading-screen" role="status" aria-label="Đang đăng nhập bằng Google">
            <div className="session-loading-card">
                <div className="session-logo-badge">
                    <Store size={36} />
                </div>
                <div className="session-loading-text">
                    <strong>Tạp hóa BIN</strong>
                    <span>Đang đăng nhập…</span>
                </div>
                <div className="session-spinner-bar" aria-hidden="true" />
            </div>
        </div>
    );
}
