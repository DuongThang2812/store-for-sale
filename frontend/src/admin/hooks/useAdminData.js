import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../services/adminApi.js';
import { useAccountStore } from '../../stores/useAccountStore.js';

export function useAdminData(resource, options = {}) {
    const key = JSON.stringify(options);
    const user = useAccountStore(state => state.user);
    const [revision, setRevision] = useState(0);
    const requestKey = `${resource}:${key}:${revision}`;
    const [state, setState] = useState({ loading: true, data: null, error: '' });
    useEffect(() => {
        let live = true;
        const current = () => live && useAccountStore.getState().user === user;
        adminApi.read(resource, JSON.parse(key)).then(data => {
            if (current()) setState({ loading: false, data, error: '', requestKey, user });
        }).catch(error => {
            if (current()) setState({ loading: false, data: null, error: error.message, requestKey, user });
        });
        return () => { live = false; };
    }, [resource, key, requestKey, user]);
    const reload = useCallback(() => { setRevision(value => value + 1); }, []);
    return { ...state, loading: state.loading || state.requestKey !== requestKey || state.user !== user, reload };
}
