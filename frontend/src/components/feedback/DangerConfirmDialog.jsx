import { useState, useId } from 'react';
import { AlertOctagon, X } from 'lucide-react';

export function DangerConfirmDialog({
    title,
    description,
    impact,
    confirmWord,
    reasonRequired = false,
    reasonLabel = 'Lý do thực hiện (bắt buộc)',
    onClose,
    onConfirm,
    busy = false,
    confirmButtonText
}) {
    const [reason, setReason] = useState('');
    const [typedWord, setTypedWord] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const titleId = useId();

    const isBusy = busy || loading;
    const isWordValid = confirmWord ? typedWord.trim() === confirmWord.trim() : true;
    const isReasonValid = reasonRequired ? reason.trim().length >= 5 : true;
    const canSubmit = !isBusy && isWordValid && isReasonValid;

    async function handleSubmit(event) {
        event.preventDefault();
        if (!canSubmit) return;
        setError('');
        setLoading(true);
        try {
            await onConfirm({ reason: reason.trim(), confirmationWord: typedWord.trim() });
            onClose();
        } catch (err) {
            setError(err?.message || 'Có lỗi xảy ra khi thực hiện thao tác.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="modal-backdrop-danger"
            role="presentation"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !isBusy) onClose();
            }}
        >
            <div
                className="modal-danger panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
            >
                <div className="modal-danger-header">
                    <div className="modal-danger-icon">
                        <AlertOctagon size={24} />
                    </div>
                    <div className="modal-danger-title-wrap">
                        <h2 id={titleId}>{title}</h2>
                        {description && <p className="modal-danger-desc">{description}</p>}
                    </div>
                    <button
                        type="button"
                        className="icon-button modal-danger-close"
                        onClick={onClose}
                        disabled={isBusy}
                        aria-label="Đóng"
                    >
                        <X size={18} />
                    </button>
                </div>

                {impact && (
                    <div className="modal-danger-impact">
                        <strong>Tác động của thao tác:</strong>
                        <p>{impact}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="modal-danger-form">
                    {reasonRequired && (
                        <label className="field">
                            <span>{reasonLabel}</span>
                            <textarea
                                required
                                minLength={5}
                                maxLength={500}
                                placeholder="Ghi rõ lý do (tối thiểu 5 ký tự)…"
                                value={reason}
                                disabled={isBusy}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </label>
                    )}

                    {confirmWord && (
                        <label className="field">
                            <span>
                                Nhập <code>{confirmWord}</code> để xác nhận thao tác
                            </span>
                            <input
                                type="text"
                                required
                                autoComplete="off"
                                spellCheck="false"
                                placeholder={`Nhập "${confirmWord}"`}
                                value={typedWord}
                                disabled={isBusy}
                                onChange={(e) => setTypedWord(e.target.value)}
                            />
                        </label>
                    )}

                    {error && (
                        <p className="error" role="alert">
                            {error}
                        </p>
                    )}

                    <div className="modal-danger-actions">
                        <button
                            type="button"
                            className="button secondary"
                            disabled={isBusy}
                            onClick={onClose}
                        >
                            Quay lại
                        </button>
                        <button
                            type="submit"
                            className="button danger"
                            disabled={!canSubmit}
                        >
                            {isBusy ? 'Đang thực hiện…' : confirmButtonText || title}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
