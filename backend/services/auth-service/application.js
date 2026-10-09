import { ApiError } from '../../shared/errors.js';

export function createAuthApplication(identity, repository) {
    const profile = async user => {
        const data = await repository.profile(user.id);
        if (!data || data.accountStatus !== 'active') throw new ApiError('FORBIDDEN',403);
        return { id: user.id, email: user.email || '', name: data.name };
    };
    return {
        async login(input) {
            const { data,error } = await identity.client().auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password });
            if (error || !data?.session) throw new ApiError('SESSION_EXPIRED',401);
            return { session: data.session, user: await profile(data.user) };
        },
        async register(input) {
            const { data,error } = await identity.client().auth.signUp({ email: input.email.trim().toLowerCase(), password: input.password,
                options: { data: { name: input.name.trim() } } });
            if (error) throw new ApiError('INVALID_REQUEST',400);
            return { session: data.session, user: data.session ? await profile(data.user) : null, requiresEmailConfirmation: !data.session };
        },
        async current(session) { const user = await identity.verify(session); return profile(user); },
        async refresh(session) {
            if (!session) throw new ApiError('SESSION_EXPIRED',401);
            const { data,error } = await identity.client().auth.refreshSession({ refresh_token: session.refreshToken });
            if (error || !data?.session) throw new ApiError('SESSION_EXPIRED',401);
            return { session: data.session, user: await profile(data.user) };
        },
        async logout(session) {
            if (session) {
                const { error } = await identity.client().auth.admin.signOut(session.accessToken,'local');
                if (error && ![401,403,404].includes(error.status)) throw new ApiError('REQUEST_FAILED',503);
            }
        },
        stores: actor => repository.stores(actor),
        createStore: (actor,input) => repository.createStore(actor,input),
    };
}
