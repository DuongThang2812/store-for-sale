import { readSupabaseConfig } from '../src/lib/supabaseConfig.js';

try {
    const { url, key } = readSupabaseConfig(process.env);
    const response = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Supabase Auth trả HTTP ${response.status}.`);
    console.log('Supabase Auth truy cập được. Kiểm tra này chưa xác nhận đăng nhập, migration hoặc RLS.');
} catch (error) {
    // Do not print request headers, environment contents or SDK session objects.
    console.error(error instanceof TypeError ? 'Không kết nối được Supabase. Kiểm tra Docker và URL.' : error.message);
    process.exitCode = 1;
}
