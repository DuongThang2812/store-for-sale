import { getSupabaseClient } from '../lib/supabase.js';
import { requiredText, unwrap } from './serviceUtils.js';

/** Inject a client for tests. Creating the service does not initialize Supabase. */
export function createAuthService(clientProvider = getSupabaseClient) {
    const auth = () => clientProvider().auth;
    const credentials = ({ email, password }) => {
        const normalized = requiredText(email, 'Email').toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Email không hợp lệ.');
        if (typeof password !== 'string' || password.length === 0) throw new Error('Vui lòng nhập mật khẩu.');
        return { email: normalized, password }; // Passwords must never be trimmed.
    };
    return Object.freeze({
        async signUp({ email, password, name, emailRedirectTo }) {
            const options = { data: { name: requiredText(name, 'Tên hiển thị') } };
            if (emailRedirectTo) options.emailRedirectTo = emailRedirectTo;
            const data = await unwrap(auth().signUp({ ...credentials({ email, password }), options }));
            return { ...data, requiresEmailConfirmation: !data.session };
        },
        async signIn(input) {
            return unwrap(auth().signInWithPassword(credentials(input)));
        },
        async getSession() {
            // For UI/session lifecycle only. Authorization is enforced by RLS/RPC.
            return (await unwrap(auth().getSession())).session;
        },
        async getUser() {
            const { data, error } = await auth().getUser();
            if (error?.name === 'AuthSessionMissingError') return null;
            if (error) throw error;
            return data.user;
        },
        async refreshSession() {
            return (await unwrap(auth().refreshSession())).session;
        },
        async signOut() {
            // Ends this browser session; local business data is cleared from memory separately.
            await unwrap(auth().signOut({ scope: 'local' }));
        },
        async requestPasswordReset(email, redirectTo) {
            const normalized = requiredText(email, 'Email').toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Email không hợp lệ.');
            await unwrap(auth().resetPasswordForEmail(normalized, { redirectTo }));
        },
        async updatePassword(password) {
            if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
                throw new Error('Mật khẩu cần ít nhất 8 ký tự, có chữ và số.');
            }
            await unwrap(auth().updateUser({ password }));
        },
        onAuthStateChange(callback) {
            // Keep the callback synchronous: enqueue further Supabase work outside it.
            const { data } = auth().onAuthStateChange((event, session) => { callback(event, session); });
            return () => data.subscription.unsubscribe();
        },
    });
}

export const authService = createAuthService();
