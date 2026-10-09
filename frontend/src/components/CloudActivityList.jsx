import { useEffect, useRef, useState } from 'react';
import { activityService } from '../services/activityService';
import { useAccountStore } from '../stores/useAccountStore';
import { ActivityList } from './ui';

export function CloudActivityList({ kind = null, customerId = null, productId = null, onCancelSale, revision = '' }) {
    const storeId = useAccountStore(state => state.store.id);
    const [result, setResult] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const serial = useRef(0);
    const lock = useRef(false);
    const key = JSON.stringify([storeId, kind, customerId, productId, revision]);
    const current = result?.key === key ? result : null;
    useEffect(() => {
        const request = ++serial.current;
        lock.current = false;
        void activityService.page(storeId, { kind, customerId, productId })
            .then(page => { if (serial.current === request) { setBusy(false); setResult({ ...page, key }); setError(''); } })
            .catch(cause => { if (serial.current === request) { setBusy(false); setError(cause.message); setResult({ key, entries: [], failed: true }); } });
        return () => { serial.current += 1; };
    }, [storeId, kind, customerId, productId, revision, key]);
    async function more() {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        const request = serial.current;
        try {
            const page = await activityService.page(storeId, { kind, customerId, productId, offset: current?.failed ? 0 : current.nextOffset });
            if (serial.current === request) setResult({ ...page, key,
                entries: [...new Map([...(current?.failed ? [] : current.entries), ...page.entries].map(row => [row.id, row])).values()] });
        } catch (cause) { if (serial.current === request) setError(cause.message); }
        finally { if (serial.current === request) { setBusy(false); lock.current = false; } }
    }
    if (!current) return <p role="status">Đang tải lịch sử từ DB…</p>;
    return <>
        {error && <p className="error" role="alert">{error}</p>}
        {!current.failed && <ActivityList entries={current.entries} resetKey={key} onCancelSale={onCancelSale}/>}
        {(current.hasMore || current.failed || error) && <button className="button secondary full" type="button" disabled={busy} onClick={more}>{busy ? 'Đang tải…' : current.failed || error ? 'Thử tải lại' : 'Tải giao dịch cũ hơn'}</button>}
    </>;
}
