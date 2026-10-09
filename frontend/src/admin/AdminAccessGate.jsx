import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { adminApi } from './services/adminApi.js';

export function AdminAccessGate() {
    const location = useLocation();
    const [retry, setRetry] = useState(0);
    const [state, setState] = useState({ path: null, loading: true, status: null, error: '' });
    useEffect(() => {
        let live = true;
        adminApi.status().then(status => {
            if (live) setState({ path: location.pathname, loading: false, status, error: '' });
        }).catch(error => {
            if (live) setState({ path: location.pathname, loading: false, status: null, error: error.message });
        });
        return () => { live = false; };
    }, [location.pathname, retry]);
    if (state.loading || state.path !== location.pathname) return <div className="admin-access-state" role="status">Đang kiểm tra quyền quản trị…</div>;
    if (state.error) return <div className="admin-access-wrapper"><div className="admin-access-state panel"><span className="admin-security-icon"><ShieldAlert size={36}/></span><h1>Chưa vào được cổng quản trị</h1><p role="alert">{state.error || 'Tài khoản của bạn hiện là Chủ tiệm, chưa có quyền Quản trị viên hệ thống (Platform Admin).'}</p><div className="admin-inline-actions"><Link className="button primary" to="/">Về cửa hàng của bạn</Link><button className="button secondary" onClick={() => { setState(current => ({ ...current, loading: true })); setRetry(value => value + 1); }}>Thử lại</button></div></div></div>;
    const mfaRoute = location.pathname.startsWith('/admin/mfa/');
    if (state.status.currentLevel !== 'aal2') {
        const target = state.status.nextLevel === 'aal2' ? '/admin/mfa/challenge' : '/admin/mfa/setup';
        if (!mfaRoute || location.pathname !== target) return <Navigate to={target} replace/>;
    } else if (mfaRoute) return <Navigate to="/admin" replace/>;
    return <Outlet context={state.status}/>;
}
