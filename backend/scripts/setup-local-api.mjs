// Local-only privileged provisioning. Never used by the Gateway or browser.
import {execSync,execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const target=resolve(root,'.env.microservices');
const existing=existsSync(target)?parseEnv(readFileSync(target,'utf8')):{};
const raw=execSync('npm exec -- supabase status -o env',{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']});
const values=Object.fromEntries(raw.split(/\r?\n/).map(line=>line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([,k,v])=>[k,v.replace(/^"|"$/g,'')]));
if(new URL(values.API_URL).origin!=='http://127.0.0.1:54321')throw new Error('Local stack only');
if(existing.SUPABASE_URL && existing.SUPABASE_URL!==values.API_URL)throw new Error('Existing backend config points to a different environment');
const urls={};
for(const domain of ['auth','catalog','inventory','sales','debt','reporting']){
    if(existing[`${domain.toUpperCase()}_DATABASE_URL`])continue;
    const password=randomBytes(32).toString('hex');
    // Domain and role names are fixed, password consists only of hex digits.
    execFileSync('docker',['exec','-i','supabase_db_little_store_fe','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],
        {input:`alter role bin_${domain}_api login password '${password}';`,encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
    const url=new URL(values.DB_URL);url.username=`bin_${domain}_api`;url.password=password;
    urls[`${domain.toUpperCase()}_DATABASE_URL`]=url.href;
    url.hostname='host.docker.internal';urls[`${domain.toUpperCase()}_DATABASE_URL_DOCKER`]=url.href;
}
const config={NODE_ENV:'development',SESSION_SECRET:randomBytes(48).toString('base64url'),SUPABASE_URL:values.API_URL,SUPABASE_ANON_KEY:values.ANON_KEY,
    ...existing,...urls,ALLOWED_ORIGINS:[5173,8080,8081,8082,8083,8084,8085,8086,8087].flatMap(port=>[`http://localhost:${port}`,`http://127.0.0.1:${port}`]).join(',')};
writeFileSync(target,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{encoding:'utf8'});
console.log('Local API capability roles configured. Existing passwords/session key preserved; secrets only in ignored backend/.env.microservices.');
