import { authService } from './authService.js';
import { ApplicationError } from '../../../backend/supabase/functions/_shared/applicationErrors.js';

/**
 * Shared API Adapter for Store domain.
 * Demonstrates calling the unified Bearer token contract from React Web.
 * Will be used alongside Flutter Dart client.
 *
 * NOTE: Never silently switch to demo mode on server failure.
 */
export function createStoreApiAdapter({
    baseUrl = import.meta.env?.VITE_API_URL || '',
    auth = authService,
    fetchFn = globalThis.fetch,
} = {}) {
    async function getAuthHeader() {
        const session = await auth.getSession();
        const token = session?.access_token;
        if (!token) {
            throw new ApplicationError('SESSION_EXPIRED', { status: 401 });
        }
        return `Bearer ${token}`;
    }

    return Object.freeze({
        async listStores() {
            const authHeader = await getAuthHeader();
            const correlationId = crypto.randomUUID();
            const cleanBase = baseUrl ? baseUrl.replace(/\/$/, '') : '';
            const url = cleanBase ? `${cleanBase}/api/v1/stores` : '/api/v1/stores';

            let response;
            try {
                response = await fetchFn(url, {
                    method: 'GET',
                    headers: {
                        'Authorization': authHeader,
                        'Accept': 'application/json',
                        'X-Correlation-ID': correlationId,
                    },
                    signal: AbortSignal.timeout(12000),
                });
            } catch (err) {
                // Fail explicitly with CONNECTION_FAILED; NEVER silently switch to demo mode!
                throw new ApplicationError('CONNECTION_FAILED', { cause: err, status: 503 });
            }

            const body = await response.json().catch(() => null);
            if (!response.ok || !body?.success) {
                const code = body?.error?.code || (response.status === 401 ? 'SESSION_EXPIRED' : 'REQUEST_FAILED');
                throw new ApplicationError(code, { status: response.status });
            }

            return body.data;
        },
    });
}

export const storeApiAdapter = createStoreApiAdapter();
