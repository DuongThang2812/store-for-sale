import { getSupabaseClient } from '../../lib/supabase.js';
import { fromAdminResponse, toApplicationError } from '../../../../backend/supabase/functions/_shared/applicationErrors.js';

export function createAdminApi(clientProvider = getSupabaseClient) {
    async function invoke(body) {
        let result;
        try {
            result = await clientProvider().functions.invoke('admin-api', { body });
        } catch (error) {
            throw toApplicationError(error);
        }
        const { data, error } = result;
        if (error) {
            let status = 0;
            let response = null;
            if (error.context instanceof Response) {
                status = error.context.status;
                response = await error.context.clone().json().catch(() => null);
            }
            throw fromAdminResponse(response, status, error);
        }
        return data;
    }

    return Object.freeze({
        async status() { return invoke({ type: 'status' }); },
        async read(resource, options = {}) {
            const result = await invoke({ type: 'read', resource, ...options });
            return result.data;
        },
        async act(action, payload) {
            const result = await invoke({ type: 'action', action,
                requestId: payload.requestId || crypto.randomUUID(), ...payload });
            return result.data;
        },
    });
}

export const adminApi = createAdminApi();
