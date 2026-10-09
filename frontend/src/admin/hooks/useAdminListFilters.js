import { useState } from 'react';
import { buildAdminListFilters } from '../domain/listFilters.js';

const defaults = { query: '', filter: 'all', sort: 'created_desc', businessType: '',
    adminId: '', action: '', eventUserId: '', fromDate: '', toDate: '' };

export function useAdminListFilters() {
    const [draft, setDraft] = useState(defaults);
    const [options, setOptions] = useState(() => buildAdminListFilters(defaults));
    const [offset, setOffset] = useState(0);
    const [error, setError] = useState('');
    return { draft, options, offset, setOffset, error,
        update: (key, value) => setDraft(current => ({ ...current, [key]: value })),
        apply(event) {
            event.preventDefault();
            try { setOptions(buildAdminListFilters(draft)); setOffset(0); setError(''); }
            catch (cause) { setError(cause.message); }
        },
        reset() { setDraft(defaults); setOptions(buildAdminListFilters(defaults)); setOffset(0); setError(''); },
    };
}
