import { createClient } from '@supabase/supabase-js';
import { readSupabaseConfig } from './supabaseConfig.js';

let client;

/** Vite loads .env.local. Lazy initialization keeps the demo usable without it. */
export function getSupabaseClient() {
    if (!client) {
        const { url, key } = readSupabaseConfig(import.meta.env ?? {});
        client = createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
                flowType: 'pkce',
                storageKey: `little-store-auth:${new URL(url).host}`,
            },
        });
    }
    return client;
}

export function getSupabaseConfigurationStatus() {
    try {
        readSupabaseConfig(import.meta.env ?? {});
        return { configured: true, error: null };
    } catch (error) {
        return { configured: false, error: error.message };
    }
}
