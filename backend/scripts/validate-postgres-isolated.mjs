// Optional validation using an installed PostgreSQL, without Docker or real shop data.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConcurrency } from './validate-postgres-concurrency.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
if (!existsSync(join(bin, 'initdb.exe'))) throw new Error('Set PG_BIN to an installed PostgreSQL bin directory.');
const workspace = mkdtempSync(join(tmpdir(), 'taphoa-sql-validation-'));
const data = join(workspace, 'data');
const port = process.env.PG_VALIDATION_PORT || '55438';
if (!/^\d{4,5}$/.test(port)) throw new Error('Invalid validation port.');
function run(name, args, input) {
    const result = spawnSync(join(bin, `${name}.exe`), args, { input, encoding: 'utf8', windowsHide: true,
        timeout: 60000, env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
        ...(name === 'pg_ctl' ? { stdio: 'ignore' } : {}) });
    if (result.error || result.status !== 0) throw new Error(`${name}: ${result.error?.message || result.stderr || result.stdout}`);
    return result.stdout;
}
const connection = ['-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'];
let running = false;
function cleanDataDirectory() {
    const expected = join(resolve(workspace), 'data');
    if (resolve(data) !== expected || !resolve(workspace).startsWith(resolve(tmpdir()) + '\\taphoa-sql-validation-')) {
        throw new Error('Refusing cleanup outside the isolated validation directory.');
    }
    rmSync(expected, { recursive: true, force: true });
}
try {
    run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C']);
    running = true;
    run('pg_ctl', ['-D', data, '-l', join(workspace, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    const bootstrap = `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema extensions;
      create schema auth;
      create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema public, auth, extensions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant all on sequences to service_role;
    `;
    run('psql', connection, bootstrap);
    const migrations = readdirSync(join(root, 'backend/supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
    for (const name of migrations) run('psql', [...connection, '-f', join(root, 'backend/supabase/migrations', name)]);
    // Optional: load a trusted, prebuilt pgTAP SQL file into this temporary DB
    // only. No downloads or machine-wide extension installation are performed.
    if (process.env.PGTAP_SQL) {
        const tapSql = readFileSync(resolve(process.env.PGTAP_SQL), 'utf8');
        run('psql', connection, `set search_path=extensions,public;\n${tapSql}`);
        run('psql', [...connection, '-f', join(root, 'backend/supabase/seed.sql')]);
        let assertions = 0;
        for (const name of readdirSync(join(root, 'backend/supabase/tests')).filter(name => name.endsWith('.test.sql')).sort()) {
            // pgTAP is already loaded from its original SQL. Keep every test
            // statement, assertion and rollback unchanged.
            const source = readFileSync(join(root, 'backend/supabase/tests', name), 'utf8')
                .replace(/^create extension if not exists pgtap with schema extensions;\r?\n/im, '');
            const tapOutput = run('psql', [...connection, '-Atq'], `set search_path=public,extensions;\n${source}`);
            writeFileSync(join(workspace, `${name}.log`), tapOutput);
            if (/^not ok\b|^Bail out!|^# (?:Looks like|No tests run)/m.test(tapOutput)) {
                throw new Error(`pgTAP failed: ${name}\n${tapOutput}`);
            }
            assertions += (tapOutput.match(/^ok \d+\b/gm) || []).length;
            if (!/^ok \d+\b/m.test(tapOutput)) throw new Error(`No pgTAP assertions were executed: ${name}`);
        }
        console.log(`${assertions} pgTAP assertions passed on the isolated PostgreSQL cluster.`);
    }
    const output = run('psql', [...connection, '-f', join(root, 'backend/tests/cloud_review_isolated.sql')]);
    writeFileSync(join(workspace, 'assertions.log'), output);
    const staffOutput = run('psql', [...connection, '-f', join(root, 'backend/tests/staff_settings_isolated.sql')]);
    writeFileSync(join(workspace, 'staff-settings-assertions.log'), staffOutput);
    await validateConcurrency({ bin, connection, run });
    console.log(`${migrations.length} migrations applied to an isolated PostgreSQL cluster. Cloud review assertions passed.`);
    console.log('Auth/HTTP/Edge integration still requires Supabase; auth.uid is mocked in this test.');
} finally {
    if (running) {
        run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
        console.log('Stopped isolated cluster.');
        // Delete only the absolute data directory this invocation created;
        // keep the log files for diagnostics. Never remove a user database.
        try { cleanDataDirectory(); }
        catch (error) { console.error(error.message); process.exitCode = 1; }
    }
    console.log(`Validation files: ${workspace}`);
}
