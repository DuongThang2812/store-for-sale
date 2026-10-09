import { useMemo, useState } from 'react';

// Keep long lists small initially; every item remains reachable with "Xem thêm".
export function useListWindow(items, resetKey = '', pageSize = 48) {
    const [window, setWindow] = useState({ key: resetKey, limit: pageSize });
    const limit = window.key === resetKey ? window.limit : pageSize;
    const visible = useMemo(() => items.slice(0, limit), [items, limit]);
    const showMore = () => setWindow({ key: resetKey, limit: limit + pageSize });
    return { visible, showMore, hasMore: items.length > limit };
}
