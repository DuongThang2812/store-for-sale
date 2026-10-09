import { useState } from 'react';
import { Modal } from '../../components/ui.jsx';
import { useAccountStore } from '../../stores/useAccountStore.js';
import { createRequestJournal } from '../../services/requestJournal.js';

const journal = createRequestJournal();
export function ActionDialog({ title, warning, confirmWord, intent, onClose, onConfirm }) {
    const [reason, setReason] = useState('');
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
        <form className="admin-confirm-form" onSubmit={async event => {
            event.preventDefault(); if (busy || typed !== confirmWord || reason.trim().length < 5) return;
            setBusy(true); setError('');
            const user = useAccountStore.getState().user;
            const current = () => !!user && useAccountStore.getState().user === user;
            try {
                if (!current()) throw new Error('Phiên đăng nhập đã đổi. Hãy mở lại thao tác.');
                const request = await journal.obtain(`admin:${user.id}:${JSON.stringify(intent)}:${reason.trim()}`);
                if (!current()) throw new Error('Phiên đăng nhập đã đổi. Hãy mở lại thao tác.');
                await onConfirm(reason.trim(), request.requestId);
                if (!current()) throw new Error('Phiên đăng nhập đã đổi. Hãy kiểm tra lại trạng thái hiện tại.');
                journal.complete(request.key); onClose();
            } catch (cause) { setError(cause.message); }
            finally { setBusy(false); }
        }}>
            <p>{warning}</p>
            <label className="field">Lý do bắt buộc<textarea required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={event => setReason(event.target.value)}/></label>
            <label className="field">Nhập <b>{confirmWord}</b> để xác nhận<input required disabled={busy} value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off"/></label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="admin-inline-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Hủy</button>
                <button className="button danger" disabled={busy || typed !== confirmWord || reason.trim().length < 5}>{busy ? 'Đang lưu…' : title}</button></div>
        </form>
    </Modal>;
}
