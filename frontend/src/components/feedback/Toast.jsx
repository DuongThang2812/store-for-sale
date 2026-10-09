import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { subscribeToast } from './toastService';

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeToast((toastItem) => {
            setToasts((prev) => [...prev, toastItem]);
            if (toastItem.duration > 0) {
                setTimeout(() => {
                    removeToast(toastItem.id);
                }, toastItem.duration);
            }
        });
        return unsubscribe;
    }, [removeToast]);

    return (
        <>
            {children}
            <div className="toast-container" role="region" aria-label="Thông báo hệ thống">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`toast-item toast-${t.type}`}
                        role="alert"
                    >
                        <span className="toast-icon">
                            {t.type === 'success' && <CheckCircle2 size={18} />}
                            {t.type === 'error' && <AlertCircle size={18} />}
                            {t.type === 'warning' && <AlertTriangle size={18} />}
                            {t.type === 'info' && <Info size={18} />}
                        </span>
                        <div className="toast-message">{t.message}</div>
                        <button
                            type="button"
                            className="toast-close"
                            onClick={() => removeToast(t.id)}
                            aria-label="Đóng thông báo"
                        >
                            <X size={15} />
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}
