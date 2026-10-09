/** Only public configuration belongs in a Vite bundle. Never log the key. */
export function readSupabaseConfig(env = {}) {
    const url = env.VITE_SUPABASE_URL?.trim();
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim();
    if (!url || !key) throw new Error('Thiếu VITE_SUPABASE_URL hoặc publishable/anon key trong .env.local.');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Supabase URL không hợp lệ.'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
        throw new Error('Supabase URL phải là HTTPS; HTTP chỉ dành cho localhost.');
    }
    if (!key.startsWith('sb_publishable_')) {
        let role;
        try {
            const parts = key.split('.');
            if (parts.length !== 3) throw new Error('Invalid token');
            const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            role = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role;
        } catch { /* Reject malformed and secret keys without exposing their contents. */ }
        // This is a configuration guard, not JWT signature verification.
        if (role !== 'anon') throw new Error('Frontend chỉ được dùng publishable key hoặc anon key. Không dùng secret/service-role key.');
    } else if (key.length <= 'sb_publishable_'.length) {
        throw new Error('Publishable key chưa hợp lệ.');
    }
    return { url: parsed.origin, key };
}
