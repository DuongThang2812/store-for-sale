import { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';

export function Modal({ title, onClose, children }) {
    const ref = useRef(null);
    const titleId = useId();
    useEffect(() => {
        const dialog = ref.current;
        const prior = document.activeElement;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        return () => {
            dialog.close();
            document.body.style.overflow = overflow;
            prior?.focus({ preventScroll: true });
        };
    }, []);
    return (
        <dialog className="modal" ref={ref} aria-labelledby={titleId}
            onCancel={event => { event.preventDefault(); onClose(); }}>
            <div className="modal-head">
                <h2 id={titleId}>{title}</h2>
                <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X/></button>
            </div>
            {children}
        </dialog>
    );
}

export function Confirm({ title, children, onClose, onConfirm, label = 'Xác nhận', danger = false }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    async function confirm() {
        if (lock.current) return;
        lock.current = true;
        setBusy(true);
        setError('');
        try { await onConfirm(); }
        catch (error) {
            setError(error.message);
            setBusy(false);
            lock.current = false;
        }
    }
    return (
        <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
            <div className="confirm-symbol" aria-hidden="true"><CircleHelp size={30}/></div>
            <div className="confirm-body">{children}</div>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="modal-actions">
                <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Quay lại</button>
                <button type="button" className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy} aria-busy={busy} onClick={confirm}>
                    {busy ? 'Đang lưu…' : label}
                </button>
            </div>
        </Modal>
    );
}
