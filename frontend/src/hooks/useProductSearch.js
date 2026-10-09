import { useDeferredValue, useMemo } from 'react';
import { normalizeSearch } from '../utils/shopHelpers';

export function useProductSearch(products, query) {
    const deferredQuery = useDeferredValue(query);
    const index = useMemo(() => products.map(product => ({ product, name: normalizeSearch(product.name) })), [products]);
    const found = useMemo(() => {
        const needle = normalizeSearch(deferredQuery.trim());
        return index.filter(row => row.name.includes(needle)).map(row => row.product);
    }, [index, deferredQuery]);
    return { found, deferredQuery, searching: query !== deferredQuery };
}
