import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { accountSession } from '../services/accountSession.js';
import { authService } from '../services/authService.js';
import { getSupabaseConfigurationStatus } from '../lib/supabase.js';
import { useCloudShopStore } from '../stores/useCloudShopStore.js';

export function AccountBootstrap({ children }) {
    useEffect(() => {
        if (!getSupabaseConfigurationStatus().configured) {
            accountSession.signedOut();
            return;
        }
        const unsubscribe = authService.onAuthStateChange(accountSession.handleAuthEvent);
        void accountSession.refresh();
        return () => { unsubscribe(); accountSession.dispose(); };
    }, []);
    return children;
}

function CheckingSession() {
    const error = useAccountStore(s => s.error);
    if (error) return (
        <div className="session-loading-screen">
            <div className="account-start-error panel">
                <h1>Chưa kết nối được tài khoản</h1>
                <p className="error" role="alert">{error}</p>
                <button className="button primary" onClick={() => { void accountSession.refresh(); }}>Thử lại</button>
            </div>
        </div>
    );
    return (
        <div className="session-loading-screen" role="status" aria-label="Đang kiểm tra phiên đăng nhập">
            <div className="session-loading-card">
                <div className="session-logo-badge">
                    <Store size={36} />
                </div>
                <div className="session-loading-text">
                    <strong>Tạp hóa BIN</strong>
                    <span>Đang kiểm tra phiên đăng nhập…</span>
                </div>
                <div className="session-spinner-bar" aria-hidden="true" />
            </div>
        </div>
    );
}

export function PublicOnlyGate({ children }) {
    const location = useLocation();
    const { ready, authLoading, user, error } = useAccountStore();
    if (authLoading || (!ready && !error)) return <CheckingSession/>;
    return user ? <Navigate to={location.search.includes('next=admin') ? '/admin' : '/'} replace/> : children;
}

export function AuthenticatedGate() {
    const location = useLocation();
    const { ready, authLoading, user, error } = useAccountStore();
    if (authLoading || (!ready && !error)) return <CheckingSession/>;
    if (error) return <CheckingSession/>;
    return user ? <Outlet/> : <Navigate to={location.pathname.startsWith('/admin') ? '/login?next=admin' : '/login'} replace/>;
}

export function StoreGate() {
    const store = useAccountStore(s => s.store);
    const dataMode = useAccountStore(s => s.dataMode);
    const cloudStoreId = useCloudShopStore(s => s.storeId);
    const cloudLoading = useCloudShopStore(s => s.loading);
    const cloudError = useCloudShopStore(s => s.error);
    const loadCloud = useCloudShopStore(s => s.load);
    useEffect(() => {
        if (store?.id && store.status === 'active' && dataMode === 'supabase' && cloudStoreId !== store.id) {
            void loadCloud(store.id).catch(() => {});
        }
    }, [store?.id, store?.status, dataMode, cloudStoreId, loadCloud]);
    if (!store) return <Navigate to="/setup" replace/>;
    if (store.status !== 'active') return <div className="account-start-error panel">
        <h1>{store.status === 'archived' ? 'Cửa hàng đã lưu trữ' : 'Cửa hàng đang tạm khóa'}</h1>
        <p>Các thao tác bán hàng, nhập kho và công nợ đang tạm dừng cho {store.name}.</p>
        <Link className="button primary" to="/setup">Chọn cửa hàng khác</Link>
    </div>;
    if (dataMode === 'supabase' && (cloudStoreId !== store.id || cloudLoading)) {
        return <div className="empty-state" role="status">Đang tải dữ liệu cửa hàng từ DB…</div>;
    }
    if (dataMode === 'supabase' && cloudError) return <div className="account-start-error panel">
        <h1>Chưa tải được dữ liệu cửa hàng</h1><p className="error" role="alert">{cloudError}</p>
        <button className="button primary" onClick={() => { void loadCloud(store.id).catch(() => {}); }}>Thử lại</button>
    </div>;
    return <Outlet/>;
}
