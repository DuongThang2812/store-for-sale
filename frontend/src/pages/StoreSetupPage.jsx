import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Apple, Store, ArrowRight, Check, Plus, LogOut } from 'lucide-react';
import { motion } from 'motion/react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { storeService } from '../services/storeService.js';
import { accountSession } from '../services/accountSession.js';
import { authService } from '../services/authService.js';
import { BUSINESS_TYPES, businessTypeLabel } from '../domain/businessTypes.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { StaggerContainer, StaggerItem } from '../components/motion/MotionPrimitives.jsx';

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
            <motion.section className="panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="session-logo-badge">
                    <Store size={32} />
                </div>
                <h1>{stores.length && !creating ? 'Chọn cửa hàng' : 'Tạo cửa hàng của bạn'}</h1>
                <p>{stores.length && !creating ? 'Chọn cửa hàng bạn muốn làm việc hôm nay.' : 'Chọn mô hình kinh doanh để thiết lập giao diện nhập và bán hàng tối ưu.'}</p>

                {stores.length > 0 && !creating && (
                    <>
                        <StaggerContainer className="store-choices">
                            {stores.map(store => (
                                <StaggerItem key={store.id}>
                                    <button
                                        type="button"
                                        className="button secondary full"
                                        disabled={busy}
                                        onClick={() => { void choose(store.id); }}
                                    >
                                        <div>
                                            <strong>{store.name}</strong>
                                            <span>{businessTypeLabel(store.businessType)} · {store.role === 'owner' ? 'Chủ tiệm' : 'Nhân viên'}</span>
                                        </div>
                                        <ArrowRight size={18} />
                                    </button>
                                </StaggerItem>
                            ))}
                        </StaggerContainer>
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
                                        >
                                            <input
                                                type="radio"
                                                name="business-type"
                                                value={type.id}
                                                checked={isSelected}
                                                onChange={() => {
                                                    setBusinessType(type.id);
                                                    if (name === 'Tạp hóa BIN' || name === 'Trái cây BIN') {
                                                        setName(type.id === 'fruit_shop' ? 'Trái cây BIN' : 'Tạp hóa BIN');
                                                    }
                                                }}
                                            />
                                            <div>
                                                <div className={`metric-icon-wrap ${isSelected ? 'metric-icon-green' : ''}`}>
                                                    <Icon size={22} />
                                                </div>
                                                <strong>{type.label}</strong>
                                                <small>{type.description}</small>
                                            </div>
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
                    className="text-link login-mode-link"
                    disabled={busy}
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
                    <LogOut size={16}/> Đăng xuất
                </button>
            </motion.section>
        </main>
    );
}
