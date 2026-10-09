import pg from 'pg';

// Infrastructure only. Each service supplies its own role URL and fixed SQL
// function contract; no table names, SQL or actor ID are accepted from HTTP.
export function createDatabase(connectionString, serviceName) {
    if (!connectionString) throw new Error(`${serviceName} requires DATABASE_URL`);
    const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
    return {
        async call(actorId, operation, args = []) {
            if (!/^[a-z_]+\.[a-z_]+$/.test(operation.name) || operation.types.length !== args.length
                || operation.types.some(type => !['uuid', 'text', 'jsonb', 'integer', 'bigint', 'boolean'].includes(type))) throw new Error('Invalid fixed database contract');
            const client = await pool.connect();
            try {
                await client.query('begin');
                await client.query("select set_config('request.jwt.claim.sub',$1,true)", [actorId]);
                await client.query("select set_config('statement_timeout','10000',true)");
                const placeholders = operation.types.map((type, i) => `$${i + 1}::${type}`).join(',');
                // pg treats JavaScript arrays as PostgreSQL arrays by default.
                // JSONB contracts must serialize arrays/objects explicitly.
                const values=args.map((value,i)=>operation.types[i]==='jsonb' && value!==null?JSON.stringify(value):value);
                const result = await client.query(`select ${operation.name}(${placeholders}) as data`, values);
                await client.query('commit');
                return result.rows[0].data;
            } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
            finally { client.release(); }
        },
        async health() { await pool.query('select 1'); return true; },
        close() { return pool.end(); },
    };
}
