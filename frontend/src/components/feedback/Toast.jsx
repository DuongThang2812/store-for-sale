import { useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { subscribeToast } from './toastService';

const TOAST_SPRING = {
    type: 'spring',
    stiffness: 420,
    damping: 32,
    mass: 0.8,
};

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
                <AnimatePresence initial={false}>
                    {toasts.map((t) => (
                        <motion.div
                            key={t.id}
                            layout
                            initial={{ opacity: 0, y: -12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.96 }}
                            transition={TOAST_SPRING}
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
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </>
    );
}
