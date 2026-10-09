import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHmac } from 'node:crypto';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = execSync('npm exec -- supabase status -o env', { cwd: backend, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(raw.split(/\r?\n/).map(line => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean).map(([, key, value]) => [key, value.replace(/^"|"$/g, '')]));
const url = env.API_URL || 'http://127.0.0.1:54321';
assert.match(url, /^http:\/\/127\.0\.0\.1:54321\/?$/, 'Smoke test chỉ chạy với Supabase local');
assert.ok(env.SERVICE_ROLE_KEY && env.ANON_KEY, 'Supabase local cần đủ key');

const service = createClient(url, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `admin-smoke-${crypto.randomUUID()}@example.invalid`;
const password = `Smoke-${crypto.randomUUID()}-9`;
let createdId = null;
let targetId = null;
let adminInserted = false;
const sql = statement => execFileSync('docker', ['exec', 'supabase_db_little_store_fe',
    'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', statement], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const call = async (token, body) => fetch(`${url}/functions/v1/admin-api`, {
    method: 'POST', headers: { apikey: env.ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
});
function totp(secret, drift = 0) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const letter of secret.toUpperCase().replace(/=+$/, '')) {
        const index = alphabet.indexOf(letter);
        assert.ok(index >= 0, 'TOTP secret chưa hợp lệ');
        bits += index.toString(2).padStart(5, '0');
    }
    const bytes = Buffer.from(bits.match(/.{8}/g).map(binary => parseInt(binary, 2)));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + drift));
    const digest = createHmac('sha1', bytes).update(counter).digest();
    const offset = digest.at(-1) & 15;
    return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}

try {
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    createdId = created.data.user.id;
    const login = await publicClient.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    const token = login.data.session.access_token;
    let response = await call(token, { type: 'status' });
    assert.equal(response.status, 403, 'User thường không có quyền Admin');
    sql(`insert into public.platform_admins(user_id) values ('${createdId}')`);
    adminInserted = true;
    response = await call(token, { type: 'status' });
    const status = await response.json();
    assert.equal(response.status, 200, 'Admin status request succeeds');
    assert.equal(status.isAdmin, true);
    assert.equal(status.currentLevel, 'aal1');
    response = await call(token, { type: 'read', resource: 'dashboard' });
    assert.equal(response.status, 403, 'AAL1 không được đọc Admin dashboard');
    const enrolled = await publicClient.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Smoke test' });
    if (enrolled.error) throw enrolled.error;
    let verified = false;
    for (const drift of [0, -1, 1]) {
        const result = await publicClient.auth.mfa.challengeAndVerify({
            factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret, drift),
        });
        if (!result.error) { verified = true; break; }
    }
    assert.equal(verified, true, 'TOTP smoke test chưa xác thực được');
    const elevated = (await publicClient.auth.getSession()).data.session.access_token;
    response = await call(elevated, { type: 'status' });
    const elevatedStatus = await response.json();
    assert.equal(response.status, 200, 'Elevated Admin status succeeds');
    assert.equal(elevatedStatus.currentLevel, 'aal2');
    response = await call(elevated, { type: 'read', resource: 'dashboard' });
    const dashboard = await response.json();
    assert.equal(response.status, 200, 'Elevated dashboard request succeeds');
    assert.ok(Number(dashboard.data.total_shops) >= 1);
    response = await call(elevated, { type: 'read', resource: 'shops', limit: 101 });
    assert.equal(response.status, 400, 'Invalid pagination is rejected by the real Edge handler');
    const target = await service.auth.admin.createUser({ email: `target-${email}`, password, email_confirm: true });
    assert.ifError(target.error);
    targetId = target.data.user.id;
    response = await call(elevated, { type: 'read', resource: 'user', targetId });
    assert.equal(response.status, 200, 'Real user detail query succeeds');
    const intents = [];
    for (let index = 0; index < 10; index++) {
        const status = index % 2 === 0 ? 'disabled' : 'active';
        const intent = { type: 'action', action: 'user_status', targetId, status,
            requestId: crypto.randomUUID(), reason: 'Owned local integration fixture' };
        intents.push(intent);
        response = await call(elevated, intent);
        assert.equal(response.status, 200, 'Admitted action succeeds through Edge/Auth/DB');
        const user = await service.auth.admin.getUserById(targetId);
        assert.ifError(user.error);
        assert.equal(new Date(user.data.user.banned_until || 0).getTime() > Date.now(), status === 'disabled', 'Auth ban reflects DB status');
        assert.equal(sql(`select account_status from public.profiles where id='${targetId}'`).trim(), status, 'DB status is authoritative');
    }
    response = await call(elevated, { ...intents[0], requestId: crypto.randomUUID() });
    assert.equal(response.status, 429, 'The eleventh new Admin intent is rate limited');
    assert.ok(Number(response.headers.get('retry-after')) >= 1, 'Rate limit includes bounded retry header');
    assert.equal(sql(`select account_status from public.profiles where id='${targetId}'`).trim(), 'active', 'Denied action cannot mutate target');
    response = await call(elevated, intents[0]);
    assert.equal(response.status, 200, 'Committed intent may retry at the limit');
    const retried = await service.auth.admin.getUserById(targetId);
    assert.ifError(retried.error);
    assert.equal(new Date(retried.data.user.banned_until || 0).getTime() > Date.now(), false, 'Old disable retry synchronizes to the current active status');
    console.log('Admin Edge integration passed: non-admin/AAL1 403, real MFA AAL2 200, validation 400, ban/unban, retry and rate limit 429.');
} catch (error) {
    console.error(`Admin Edge integration failed: ${error.code || error.name || 'REQUEST_FAILED'}.`);
    if (error.code === 'ERR_ASSERTION') console.error(error.message);
    process.exitCode = 1;
} finally {
    // Every condition uses UUIDs returned by this run's createUser calls.
    if (createdId) sql(`begin;
        do $$ begin
            if not exists(select 1 from auth.users where id='${createdId}' and email='${email}') then
                raise exception 'Fixture identity mismatch';
            end if;
        end $$;
        -- Session-local bypass for this run's synthetic append-only audit rows.
        -- Does not change triggers, constraints or another connection's behavior.
        set local session_replication_role=replica;
        delete from public.admin_audit_logs where admin_user_id='${createdId}';
        delete from public.admin_action_admissions where actor_id='${createdId}';
        delete from public.admin_action_rate_windows where actor_id='${createdId}';
        delete from public.security_events where user_id='${createdId}';
        commit;`);
    if (adminInserted) sql(`delete from public.platform_admins where user_id = '${createdId}'`);
    for (const fixtureId of [targetId, createdId].filter(Boolean)) {
        const removed = await service.auth.admin.deleteUser(fixtureId);
        if (removed.error) {
            console.error('Could not remove an owned integration account.');
            process.exitCode = 1;
        }
    }
}
