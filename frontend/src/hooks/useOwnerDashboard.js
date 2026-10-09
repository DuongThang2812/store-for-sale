import { useCallback, useEffect, useState } from 'react';
import { useAccountStore } from '../stores/useAccountStore.js';
import { reportService } from '../services/reportService.js';
import { reportScopeMatches } from '../domain/reportScope.js';

export function useOwnerDashboard(entries) {
    const user = useAccountStore(state => state.user);
    const storeId = useAccountStore(state => state.store?.id);
    const role = useAccountStore(state => state.store?.role);
    const dataMode = useAccountStore(state => state.dataMode);
    const [reload, setReload] = useState(0);
    const [state, setState] = useState(null);
    useEffect(() => {
        if (dataMode !== 'supabase' || role !== 'owner') return;
        let live = true;
        const current = () => {
            const account = useAccountStore.getState();
            return live && account.user === user && account.store?.id === storeId
                && account.dataMode === 'supabase' && account.store?.role === 'owner';
        };
        const scope = { user, storeId, revision: entries, reload };
        reportService.getDashboard(storeId).then(data => {
            if (current()) setState({ ...scope, data, error: '' });
        }).catch(() => {
            if (current()) setState({ ...scope, data: null, error: 'Chưa tải được số liệu cửa hàng. Hãy thử lại.' });
        });
        return () => { live = false; };
    }, [user, storeId, role, dataMode, entries, reload]);
    const matches = reportScopeMatches(state, { user, storeId, role, dataMode, revision: entries }) && state.reload === reload;
    const retry = useCallback(() => setReload(value => value + 1), []);
    return { data: matches ? state.data : null, error: matches ? state.error : '', retry };
}
