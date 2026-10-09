import { Outlet, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore';
import { canUseShopOperation } from '../domain/shopPermissions';

export function ShopOperationGate({ operation }) {
    const store = useAccountStore(state => state.store);
    if (canUseShopOperation(store, operation)) return <Outlet/>;
    return (
        <section className="panel empty-state" style={{ maxWidth: '480px', margin: '40px auto', padding: '40px 24px', textAlign: 'center' }}>
            <span className="choice-icon orange" style={{ margin: '0 auto 16px' }}>
                <ShieldAlert size={36} />
            </span>
            <h1 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--text-primary)' }}>Bạn chưa được cấp quyền này</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '15px' }}>
                Thao tác này dành riêng cho chủ cửa hàng hoặc nhân viên được phân quyền trong <b>Cài đặt → Nhân viên</b>.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <Link className="button primary" to="/inventory">
                    <ArrowLeft size={18} /> Xem kho hàng
                </Link>
            </div>
        </section>
    );
}
