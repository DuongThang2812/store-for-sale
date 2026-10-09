// Zustand updates these slices immutably. Reuse JSON for unchanged slices while
// keeping the existing single-key format and synchronous, atomic storage write.
export function createSnapshotEncoder() {
    const cache = new WeakMap();
    function encode(value) {
        if (value === null || typeof value !== 'object') return JSON.stringify(value);
        if (!cache.has(value)) cache.set(value, JSON.stringify(value));
        return cache.get(value);
    }
    return ({ state, version }) => {
        const fields = Object.entries(state).flatMap(([key, value]) => {
            const json = encode(value);
            return json === undefined ? [] : [`${JSON.stringify(key)}:${json}`];
        });
        const metadata = version === undefined ? '' : `,"version":${JSON.stringify(version)}`;
        return `{"state":{${fields.join(',')}}${metadata}}`;
    };
}

export function createCachedStorage(getStorage = () => localStorage) {
    let storage;
    try { storage = getStorage(); } catch { return undefined; }
    const encode = createSnapshotEncoder();
    return {
        getItem(name) {
            const raw = storage.getItem(name);
            return raw === null ? null : JSON.parse(raw);
        },
        setItem(name, value) { storage.setItem(name, encode(value)); },
        removeItem(name) { storage.removeItem(name); },
    };
}
