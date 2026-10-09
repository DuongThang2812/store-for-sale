import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Apple, Store, ArrowRight, Check, Plus } from 'lucide-react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { storeService } from '../services/storeService.js';
import { accountSession } from '../services/accountSession.js';
import { authService } from '../services/authService.js';
import { BUSINESS_TYPES, businessTypeLabel } from '../domain/businessTypes.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

export function StoreSetupPage() {
    useDocumentTitle();
    const navigate = useNavigate();
    const stores = useAccountStore(s => s.stores);
    const [name, setName] = useState('Tạp hóa BIN');
    const [businessType, setBusinessType] = useState('grocery');
    const [creating, setCreating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function choose(storeId) {
        setBusy(true); setError('');
        try {
            await accountSession.refresh(storeId);
            if (useAccountStore.getState().store?.id === storeId) {
                navigate('/', { replace: true });
            } else {
                setError('Chưa mở được cửa hàng. Vui lòng thử lại.');
            }
        } catch {
            setError('Chưa mở được cửa hàng. Vui lòng thử lại.');
        } finally {
            setBusy(false);
        }
    }

    async function create(event) {
        event.preventDefault();
        setBusy(true); setError('');
        try {
            const id = await storeService.createStore(name.trim(), businessType);
            await accountSession.refresh(id);
            if (useAccountStore.getState().store?.id === id) {
                navigate('/', { replace: true });
            } else {
                setError('Cửa hàng đã tạo nhưng chưa mở được. Vui lòng tải lại trang.');
            }
        } catch { setError('Chưa tạo được cửa hàng. Vui lòng thử lại.'); }
        finally { setBusy(false); }
    }

    return (
        <main className="store-setup">
            <section className="panel">
                <div className="session-logo-badge" style={{ margin: '0 auto 12px' }}>
                    <Store size={32} />
                </div>
                <h1>{stores.length && !creating ? 'Chọn cửa hàng' : 'Tạo cửa hàng của bạn'}</h1>
                <p>{stores.length && !creating ? 'Chọn cửa hàng bạn muốn làm việc hôm nay.' : 'Chọn mô hình kinh doanh để thiết lập giao diện nhập và bán hàng tối ưu.'}</p>

                {stores.length > 0 && !creating && (
                    <>
                        <div className="store-choices">
                            {stores.map(store => (
                                <button
                                    type="button"
                                    className="button secondary full"
                                    key={store.id}
                                    disabled={busy}
                                    onClick={() => { void choose(store.id); }}
                                    style={{ justifyContent: 'space-between', padding: '14px 18px', height: 'auto' }}
                                >
                                    <div style={{ textAlign: 'left' }}>
                                        <strong style={{ display: 'block', fontSize: '15px' }}>{store.name}</strong>
                                        <small style={{ color: 'var(--muted)' }}>{businessTypeLabel(store.businessType)} · {store.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'}</small>
                                    </div>
                                    <ArrowRight size={18} />
                                </button>
                            ))}
                        </div>
                        <button type="button" className="button primary full" disabled={busy} onClick={() => setCreating(true)}>
                            <Plus size={18} /> Thêm cửa hàng mới
                        </button>
                    </>
                )}

                {(!stores.length || creating) && (
                    <form onSubmit={create}>
                        <label className="field">
                            <span>Tên cửa hàng</span>
                            <input required maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Tạp hóa BIN" />
                        </label>

                        <fieldset className="business-type-field">
                            <legend>Mô hình kinh doanh của bạn</legend>
                            <div className="business-type-options">
                                {BUSINESS_TYPES.map(type => {
                                    const isSelected = businessType === type.id;
                                    const Icon = type.id === 'fruit_shop' ? Apple : Store;
                                    return (
                                        <label
                                            key={type.id}
                                            className={`business-type-option ${isSelected ? 'selected' : ''}`}
                                            style={{ position: 'relative' }}
                                        >
                                            <input
                                                type="radio"
                                                name="business-type"
                                                value={type.id}
                                                checked={isSelected}
                                                style={{ position: 'absolute', top: '14px', right: '14px' }}
                                                onChange={() => {
                                                    setBusinessType(type.id);
                                                    if (name === 'Tạp hóa BIN' || name === 'Trái cây BIN') {
                                                        setName(type.id === 'fruit_shop' ? 'Trái cây BIN' : 'Tạp hóa BIN');
                                                    }
                                                }}
                                            />
                                            <div className="metric-icon-wrap" style={{ background: isSelected ? '#e6f4ea' : '#f0f4f1', color: '#175c45', marginBottom: '4px' }}>
                                                <Icon size={24} />
                                            </div>
                                            <strong>{type.label}</strong>
                                            <small>{type.description}</small>
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>

                        <button className="button primary full" disabled={busy || !name.trim()}>
                            {busy ? 'Đang tạo…' : 'Tạo cửa hàng và bắt đầu'} <Check size={18} />
                        </button>

                        {stores.length > 0 && (
                            <button type="button" className="button secondary full" disabled={busy} onClick={() => setCreating(false)}>
                                Quay lại danh sách cửa hàng
                            </button>
                        )}
                    </form>
                )}

                {error && <p className="error" role="alert">{error}</p>}

                <button
                    type="button"
                    className="text-link"
                    disabled={busy}
                    style={{ margin: '8px auto 0' }}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await authService.signOut();
                            accountSession.signedOut();
                        } catch {
                            setError('Chưa đăng xuất được. Vui lòng thử lại.');
                            setBusy(false);
                        }
                    }}
                >
                    Đăng xuất
                </button>
            </section>
        </main>
    );
}
