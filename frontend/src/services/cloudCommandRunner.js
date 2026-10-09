import { createRequestJournal } from './requestJournal.js';

const scopeError = () => new Error('Phiên hoặc cửa hàng đã đổi. Hãy mở lại cửa hàng để xem kết quả giao dịch.');

export function createCloudCommandRunner({ context, journal = createRequestJournal() }) {
    return async function run(storeId, kind, intent, perform, reload) {
        const start = context();
        const current = () => {
            const now = context();
            return start.scope === now.scope && start.actorId === now.actorId && now.storeId === storeId;
        };
        if (!current()) throw scopeError();
        const identity = `${start.actorId}:${storeId}:${kind}:${JSON.stringify(intent)}`;
        const { key, requestId } = await journal.obtain(identity);
        if (!current()) throw scopeError();
        const result = await perform(requestId);
        if (!current()) throw scopeError();
        await reload(storeId);
        if (!current()) throw scopeError();
        journal.complete(key);
        return result;
    };
}
