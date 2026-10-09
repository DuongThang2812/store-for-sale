import { createClient } from '@supabase/supabase-js';
import { ApiError } from './errors.js';

export function createIdentityProvider(env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Server Supabase Auth configuration missing');
    const makeClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: (url, options = {}) => fetch(url, { ...options,
                signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) }) } });
    return {
        client: makeClient,
        async verify(session) {
            if (!session) throw new ApiError('SESSION_EXPIRED', 401);
            const { data, error } = await makeClient().auth.getUser(session.accessToken);
            if (error || !data?.user) throw new ApiError('SESSION_EXPIRED', 401);
            return { id: data.user.id, email: data.user.email || '' };
        },
    };
}
