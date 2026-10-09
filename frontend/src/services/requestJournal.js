const prefix = 'little-store-request:';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function browserSessionStorage() {
    try { return globalThis.sessionStorage; } catch { return null; }
}

/** UI request IDs only; no customer data, balances or business payloads are persisted. */
export function createRequestJournal(storage = browserSessionStorage()) {
    const requests = new Map();
    const inFlight = new Map();
    async function keyFor(intent) {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(intent));
        return prefix + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    async function obtain(intent) {
        const key = await keyFor(intent);
        if (!inFlight.has(key)) inFlight.set(key, Promise.resolve().then(() => {
            if (requests.has(key)) return { key, requestId: requests.get(key) };
            let requestId;
            try { requestId = storage?.getItem(key); } catch { /* In-memory retry still works. */ }
            if (!uuid.test(requestId || '')) requestId = crypto.randomUUID();
            requests.set(key, requestId);
            try { storage?.setItem(key, requestId); } catch { /* Private browsing/storage quota. */ }
            return { key, requestId };
        }).finally(() => { inFlight.delete(key); }));
        return inFlight.get(key);
    }
    function complete(key) {
        requests.delete(key);
        try { storage?.removeItem(key); } catch { /* A retained ID remains safe to retry. */ }
    }
    return Object.freeze({ obtain, complete });
}
