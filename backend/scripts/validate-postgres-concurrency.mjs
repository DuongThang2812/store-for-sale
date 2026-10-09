import { spawn } from 'node:child_process';
import { join } from 'node:path';
import assert from 'node:assert/strict';

export async function validateConcurrency({ bin, connection, run }) {
    const sql = text => run('psql', [...connection, '-Atq'], text).trim();
    const actor = 'fb000000-0000-4000-8000-000000000001';
    const login = `set role authenticated; set request.jwt.claim.sub='${actor}';`;
    sql(`insert into auth.users(id,email,raw_user_meta_data) values('${actor}','concurrent@example.invalid','{}');`);
    const store = sql(`${login} select public.create_store('Concurrent validation');`);
    const product = sql(`${login} select public.save_product('${store}','Hàng test','Hàng','other','lon',
      '[{"key":"base","name":"lon","factor":1,"purchase_price":6000,"sale_price":10000,"can_purchase":true,"can_sell":true}]',0);`);
    sql(`${login} select public.receive_stock('${store}','fb000000-0000-4000-8000-000000000101',
      '[{"product_id":"${product}","unit_key":"base","quantity":5,"unit_cost":6000}]');`);
    function connectionTask(text, { keepOpen = false, onOutput = () => {} } = {}) {
        const child = spawn(join(bin, 'psql.exe'), [...connection, '-Atq'], { windowsHide: true,
            env: { ...process.env, PGCLIENTENCODING: 'UTF8' } });
        const done = new Promise(resolve => {
            let output = '', error = '';
            child.stdout.on('data', chunk => { output += chunk; onOutput(output); });
            child.stderr.on('data', chunk => { error += chunk; });
            child.on('error', cause => resolve({ status: -1, error: cause.message }));
            child.on('close', status => resolve({ status, output: output.trim(), error }));
        });
        if (keepOpen) child.stdin.write(text, 'utf8');
        else child.stdin.end(text, 'utf8');
        return { child, done };
    }
    const concurrent = text => connectionTask(text).done;
    const version = sql(`select version from public.products where id='${product}';`);
    const items = `[{"product_id":"${product}","unit_key":"base","quantity":2,"expected_version":${version}}]`;
    const duplicateCommand = `${login} begin; select public.create_sale_reviewed('${store}',
      'fb000000-0000-4000-8000-000000000102','${items}'); select pg_sleep(0.15); commit;`;
    const duplicates = await Promise.all([concurrent(duplicateCommand), concurrent(duplicateCommand)]);
    assert.ok(duplicates.every(result => result.status === 0), JSON.stringify(duplicates));
    assert.equal(sql(`select stock_base from public.products where id='${product}';`), '3');
    assert.equal(sql(`select count(*) from public.sales where store_id='${store}';`), '1');
    assert.equal(duplicates.filter(result => JSON.parse(result.output).duplicate).length, 1);
    const nextVersion = sql(`select version from public.products where id='${product}';`);
    const nextItems = items.replace(`"expected_version":${version}`, `"expected_version":${nextVersion}`);
    const competingSales = await Promise.all([103,104].map(id => concurrent(`${login} begin;
      select public.create_sale_reviewed('${store}','fb000000-0000-4000-8000-000000000${id}','${nextItems}');
      select pg_sleep(0.15); commit;`)));
    assert.equal(competingSales.filter(result => result.status === 0).length, 1);
    assert.equal(competingSales.filter(result => result.status !== 0).length, 1);
    assert.equal(sql(`select stock_base from public.products where id='${product}';`), '1');
    const customer = JSON.parse(sql(`${login} select public.create_customer('${store}',
      'fb000000-0000-4000-8000-000000000105','Khách test');`)).customer_id;
    sql(`${login} select public.create_sale('${store}','fb000000-0000-4000-8000-000000000106',
      '[{"product_id":"${product}","unit_key":"base","quantity":1}]','credit','${customer}');`);
    const payments = await Promise.all([107,108].map(id => concurrent(`${login} begin;
      select public.record_debt_payment('${store}','${customer}',6000,'fb000000-0000-4000-8000-000000000${id}');
      select pg_sleep(0.15); commit;`)));
    assert.equal(payments.filter(result => result.status === 0).length, 1);
    assert.equal(sql(`select current_debt from public.customers where id='${customer}';`), '4000');
    assert.equal(sql(`select sum(amount) from public.debt_payments where store_id='${store}';`), '6000');

    // Hold an actual staff sale transaction open, verify the owner's revoke is
    // waiting on its lock, then commit. No sleep-based assumption about order.
    const staff = 'fb000000-0000-4000-8000-000000000002';
    sql(`insert into auth.users(id,email,raw_user_meta_data) values('${staff}','concurrent-staff@example.invalid','{}');`);
    sql(`${login} select public.save_store_staff('${store}','fb000000-0000-4000-8000-000000000109','concurrent-staff@example.invalid');
      select public.receive_stock('${store}','fb000000-0000-4000-8000-000000000110',
      '[{"product_id":"${product}","unit_key":"base","quantity":2,"unit_cost":6000}]');`);
    const staffLogin = `set role authenticated; set request.jwt.claim.sub='${staff}';`;
    let signalReady;
    const ready = new Promise(resolve => { signalReady = resolve; });
    const staffSale = connectionTask(`${staffLogin} begin;
      select public.create_sale('${store}','fb000000-0000-4000-8000-000000000111',
      '[{"product_id":"${product}","unit_key":"base","quantity":1}]');
      \\echo STAFF_READY
      `, { keepOpen: true, onOutput: output => { if (output.includes('STAFF_READY')) signalReady(); } });
    let revoke;
    let readyTimer;
    try {
        await Promise.race([ready, staffSale.done.then(result => { throw new Error(`Staff sale exited before ready: ${JSON.stringify(result)}`); }),
            new Promise((_, reject) => { readyTimer = setTimeout(() => reject(new Error('Staff sale readiness timeout')), 10000); })]);
        clearTimeout(readyTimer);
        revoke = connectionTask(`${login} set application_name='validation-staff-revoke';
          select public.save_store_staff('${store}','fb000000-0000-4000-8000-000000000112',null,
          true,false,false,false,'${staff}',1);`);
        const deadline = Date.now() + 10000;
        let waiting = false;
        while (Date.now() < deadline) {
            waiting = sql(`select exists(select 1 from pg_stat_activity where application_name='validation-staff-revoke'
              and cardinality(pg_blocking_pids(pid))>0);`) === 't';
            if (waiting) break;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.ok(waiting, 'permission revocation must wait for the admitted sale transaction');
        staffSale.child.stdin.end('commit;\n');
        const results = await Promise.all([staffSale.done, revoke.done]);
        assert.ok(results.every(result => result.status === 0), JSON.stringify(results));
        assert.equal(sql(`select is_active from public.store_members where store_id='${store}' and user_id='${staff}';`), 'f');
        assert.equal(sql(`select stock_base from public.products where id='${product}';`), '1');
        assert.equal(sql(`select count(*) from public.sales where store_id='${store}' and created_by='${staff}';`), '1');
        const denied = await concurrent(`${staffLogin} select public.create_sale('${store}',
          'fb000000-0000-4000-8000-000000000113','[{"product_id":"${product}","unit_key":"base","quantity":1}]');`);
        assert.notEqual(denied.status, 0, 'an old staff JWT cannot start a sale after revoke commits');
        assert.equal(sql(`select stock_base from public.products where id='${product}';`), '1');
    } finally {
        clearTimeout(readyTimer);
        if (staffSale.child.exitCode === null && !staffSale.child.stdin.writableEnded) staffSale.child.stdin.end('rollback;\n');
        await staffSale.done;
        if (revoke) await revoke.done;
    }
    // Two Edge instances racing for the last Admin intent slot must share one
    // PostgreSQL lock. No business RPC is invoked by this admission test.
    sql(`insert into public.platform_admins(user_id) values('${actor}');`);
    const admit = id => `set role service_role; select public.admin_admit_action('${actor}',
      'fb000000-0000-4000-9000-${String(id).padStart(12, '0')}',
      'user_status','${staff}','Concurrency rate fixture','disabled');`;
    for (let id = 1; id <= 9; id++) assert.equal(JSON.parse(sql(admit(id))).allowed, true);
    const admissions = await Promise.all([concurrent(admit(10)), concurrent(admit(11))]);
    assert.ok(admissions.every(result => result.status === 0), JSON.stringify(admissions));
    assert.equal(admissions.filter(result => JSON.parse(result.output).allowed).length, 1,
        'only one of two parallel requests can use the final intent slot');
    assert.equal(sql(`select count(*) from public.admin_action_admissions where actor_id='${actor}';`), '10');
    const sameAdmission = await Promise.all([concurrent(admit(1)), concurrent(admit(1))]);
    assert.ok(sameAdmission.every(result => result.status === 0 && JSON.parse(result.output).duplicate));
    assert.equal(sql(`select count(*) from public.admin_action_admissions where actor_id='${actor}';`), '10');
    console.log('Concurrent retries, competing sales/debt payments, staff revocation and Admin rate admission passed.');
}
