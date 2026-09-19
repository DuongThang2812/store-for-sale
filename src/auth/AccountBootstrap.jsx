import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAccountStore } from '../stores/useAccountStore';
import { initializeDemoAccount, openDemoAccount } from '../services/accountService';

export function AccountBootstrap({ children }) {
    const { ready, error } = useAccountStore();
    useEffect(() => { initializeDemoAccount(); }, []);
    if (error) return <div className="account-start-error panel"><h1>Chưa mở được dữ liệu trên máy</h1><p className="error" role="alert">{error}</p><button className="button primary" onClick={() => { try { openDemoAccount(); } catch (e) { useAccountStore.getState().setError(e.message); } }}>Mở lại dữ liệu dùng thử</button><p>Không xóa dữ liệu trình duyệt nếu bạn chưa tải bản sao lưu.</p></div>;
    if (!ready) return <div className="empty-state" role="status">Đang mở dữ liệu trên máy…</div>;
    return children;
}
export function DemoAccountGate() {
    const profile = useAccountStore(s => s.profile);
    return profile ? <Outlet/> : <Navigate to="/login" replace/>;
}
