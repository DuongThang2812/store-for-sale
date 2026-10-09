import assert from 'node:assert/strict';
import {execFileSync,execSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {buildAuthService} from '../services/auth-service/app.js';
import {buildCatalogService} from '../services/catalog-service/app.js';
import {buildGateway} from '../gateway/app.js';
import {buildInventoryService} from '../services/inventory-service/app.js';
import {buildSalesService} from '../services/sales-service/app.js';
import {buildDebtService} from '../services/debt-service/app.js';
import {buildReportingService} from '../services/reporting-service/app.js';

const root=fileURLToPath(new URL('..',import.meta.url));
assert.equal(new URL(process.env.SUPABASE_URL).origin,'http://127.0.0.1:54321','Local only');
const raw=execSync('npm exec -- supabase status -o env',{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']});
const env=Object.fromEntries(raw.split(/\r?\n/).map(line=>line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(([,k,v])=>[k,v.replace(/^"|"$/g,'')]));
const service=createClient(env.API_URL,env.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const marker=`bin-api-${randomUUID()}`;
const users=[];const servers=[];let shopId;
const sql=text=>execFileSync('docker',['exec','-i','supabase_db_little_store_fe','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','ignore']});
const counts=()=>sql("select jsonb_build_object('users',(select count(*) from auth.users),'shops',(select count(*) from public.stores),'products',(select count(*) from public.products),'sales',(select count(*) from public.sales))").trim();
const baseline=counts();
let origin;
async function account(role){
    const email=`${marker}-${role}@example.invalid`;const password=`Test-${randomUUID()}-9`;
    const created=await service.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
    users.push({id:created.data.user.id,email});
    const jar=new Map();let csrf;
    const call=async(path,{method='GET',body}={})=>{
        const response=await fetch(`${origin}/api/v1/${path}`,{method,headers:{origin:'http://localhost:8080',
            ...(jar.size && {cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')}),
            ...(csrf && {'x-csrf-token':csrf}),...(body && {'content-type':'application/json'})},
            ...(body && {body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
        for(const cookie of response.headers.getSetCookie()){
            const [entry]=cookie.split(';');const at=entry.indexOf('=');jar.set(entry.slice(0,at),entry.slice(at+1));
        }
        const data=await response.json();if(data.csrfToken)csrf=data.csrfToken;
        return {status:response.status,data};
    };
    assert.equal((await call('auth/session')).status,200);
    const login=await call('auth/login',{method:'POST',body:{email,password}});
    assert.equal(login.status,200);assert.equal(login.data.user.id,created.data.user.id);
    assert.equal('session' in login.data,false);assert.equal('access_token' in login.data,false);
    return {id:created.data.user.id,call};
}

try{
    const auth=await buildAuthService({logger:false});servers.push(auth);const authUrl=await auth.listen({host:'127.0.0.1',port:0});
    const catalog=await buildCatalogService({logger:false});servers.push(catalog);const catalogUrl=await catalog.listen({host:'127.0.0.1',port:0});
    const inventory=await buildInventoryService({logger:false});servers.push(inventory);const inventoryUrl=await inventory.listen({host:'127.0.0.1',port:0});
    const sales=await buildSalesService({logger:false});servers.push(sales);const salesUrl=await sales.listen({host:'127.0.0.1',port:0});
    const debt=await buildDebtService({logger:false});servers.push(debt);const debtUrl=await debt.listen({host:'127.0.0.1',port:0});
    const reporting=await buildReportingService({logger:false});servers.push(reporting);const reportingUrl=await reporting.listen({host:'127.0.0.1',port:0});
    const gateway=await buildGateway({logger:false,env:{...process.env,AUTH_SERVICE_URL:authUrl,CATALOG_SERVICE_URL:catalogUrl,INVENTORY_SERVICE_URL:inventoryUrl,SALES_SERVICE_URL:salesUrl,DEBT_SERVICE_URL:debtUrl,REPORTING_SERVICE_URL:reportingUrl}});servers.push(gateway);
    origin=await gateway.listen({host:'127.0.0.1',port:0});
    const owner=await account('owner');const outsider=await account('other');
    const created=await owner.call('auth/stores',{method:'POST',body:{name:marker,businessType:'grocery'}});
    assert.equal(created.status,201);shopId=created.data.id;
    const input={shopId,requestId:randomUUID(),name:'Cola private API',category:'Nước',productGroup:'drinks',baseUnit:'chai',
        units:[{key:'base',name:'chai',factor:1,purchasePrice:6000,salePrice:10000,canPurchase:true,canSell:true}],openingStock:0};
    const product=await owner.call('products',{method:'POST',body:input});assert.equal(product.status,201);
    assert.equal(product.data.stockBase,0);assert.equal(product.data.units[0].purchasePrice,6000);
    const duplicate=await owner.call('products',{method:'POST',body:input});assert.equal(duplicate.status,201);assert.equal(duplicate.data.id,product.data.id);
    const list=await owner.call(`products?shopId=${shopId}&limit=1`);assert.equal(list.status,200);assert.equal(list.data.length,1);
    const other=await outsider.call(`products?shopId=${shopId}`);assert.equal(other.status,403);
    const invalid=await owner.call(`products/${product.data.id}`,{method:'PUT',body:{...input,expectedVersion:product.data.version,stockBase:999999}});assert.equal(invalid.status,400);
    const receipt={shopId,requestId:randomUUID(),items:[{productId:product.data.id,unitKey:'base',quantity:10,unitCost:6000}]};
    const imported=await owner.call('inventory/imports',{method:'POST',body:receipt});assert.equal(imported.status,200,'Inventory import');assert.equal(imported.data.total_cost,60000);
    const retry=await owner.call('inventory/imports',{method:'POST',body:receipt});assert.equal(retry.status,200);assert.equal(retry.data.duplicate,true);
    const current=await owner.call(`products/${product.data.id}?shopId=${shopId}`);assert.equal(current.data.stockBase,10);
    const count={shopId,requestId:randomUUID(),items:[{productId:product.data.id,actualBase:9,expectedVersion:current.data.version,reason:'Owned physical count'}]};
    assert.equal((await owner.call('inventory/counts',{method:'POST',body:count})).status,200);
    assert.equal((await owner.call('inventory/counts',{method:'POST',body:{...count,requestId:randomUUID()}})).status,400);
    assert.equal((await outsider.call('inventory/imports',{method:'POST',body:receipt})).status,403);
    const counted=await owner.call(`products/${product.data.id}?shopId=${shopId}`);
    const intent={shopId,requestId:randomUUID(),items:[{productId:product.data.id,unitKey:'base',quantity:2,expectedVersion:counted.data.version}]};
    assert.equal((await owner.call('sales/checkout',{method:'POST',body:{...intent,totalAmount:1}})).status,400);
    const sold=await owner.call('sales/checkout',{method:'POST',body:intent});assert.equal(sold.status,200);assert.equal(sold.data.total_amount,20000);
    assert.equal((await owner.call('sales/checkout',{method:'POST',body:intent})).data.duplicate,true);
    const preview=await owner.call(`sales/${sold.data.sale_id}/cancellation-preview?shopId=${shopId}`);assert.equal(preview.status,200);assert.equal(preview.data.refund_amount,20000);
    const cancel={shopId,requestId:randomUUID(),reason:'Owned fixture cancellation',previewToken:preview.data.preview_token};
    assert.equal((await owner.call(`sales/${sold.data.sale_id}/cancel`,{method:'POST',body:cancel})).status,200);
    assert.equal((await owner.call(`sales/${sold.data.sale_id}/cancel`,{method:'POST',body:cancel})).data.duplicate,true);
    assert.equal((await owner.call(`products/${product.data.id}?shopId=${shopId}`)).data.stockBase,9);
    const customer=await owner.call('customers',{method:'POST',body:{shopId,requestId:randomUUID(),name:'Khách API'}});assert.equal(customer.status,200);
    const customerId=customer.data.customer_id;
    const available=await owner.call(`products/${product.data.id}?shopId=${shopId}`);
    const credit=await owner.call('sales/checkout',{method:'POST',body:{shopId,requestId:randomUUID(),paymentType:'credit',customerId,items:[{productId:product.data.id,unitKey:'base',quantity:2,expectedVersion:available.data.version}]}});
    assert.equal(credit.status,200);assert.equal((await owner.call(`customers/${customerId}?shopId=${shopId}`)).data.totalDebt,20000);
    const payment={shopId,requestId:randomUUID(),amount:5000};
    assert.equal((await owner.call(`debts/customers/${customerId}/payments`,{method:'POST',body:payment})).data.remaining_debt,15000);
    assert.equal((await owner.call(`debts/customers/${customerId}/payments`,{method:'POST',body:payment})).data.duplicate,true);
    const dashboard=await owner.call(`reports/dashboard?shopId=${shopId}`);assert.equal(dashboard.status,200);assert.equal(dashboard.data.report.totals.revenue,20000);assert.equal(dashboard.data.report.totals.cash_collected,5000);assert.equal(dashboard.data.report.totals.gross_profit,8000);
    const rawClient=new pg.Client({connectionString:process.env.CATALOG_DATABASE_URL});await rawClient.connect();
    try{await assert.rejects(rawClient.query('select * from public.products'),error=>error.code==='42501');}
    finally{await rawClient.end();}
    const openapi=await fetch(`${origin}/openapi.json`).then(response=>response.json());
    assert.ok(openapi.paths['/api/v1/auth/login']);assert.ok(openapi.paths['/api/v1/products/{id}']);
    assert.equal((await owner.call('auth/refresh',{method:'POST'})).status,200);
    assert.equal((await owner.call('auth/logout',{method:'POST'})).status,200);
    assert.equal((await owner.call('auth/me')).status,401);
    console.log('Real Gateway/Auth/Catalog/Inventory integration passed: cookie Auth, tenant isolation, product/import retry, reviewed count, private DB capability and Swagger.');
}catch(error){console.error(`Microservice integration failed: ${error.code || error.name || 'FAILED'}`);if(error.code==='ERR_ASSERTION')console.error(error.message);process.exitCode=1;}
finally{
    await Promise.allSettled(servers.reverse().map(server=>server.close()));
    try{
        if(shopId){
            assert.match(shopId,/^[0-9a-f-]{36}$/i);
            assert.equal(sql(`select name from public.stores where id='${shopId}'`).trim(),marker);
            sql(`begin;
                delete from public.product_save_requests where store_id='${shopId}';
                delete from public.reviewed_sale_requests where store_id='${shopId}';
                delete from public.sale_cancellation_requests where store_id='${shopId}';
                delete from public.customer_create_requests where store_id='${shopId}';
                delete from public.payment_allocations where store_id='${shopId}';
                delete from public.debt_payments where store_id='${shopId}';
                delete from public.inventory_adjustment_valuations where store_id='${shopId}';
                delete from public.inventory_count_items where store_id='${shopId}';
                delete from public.stock_movements where store_id='${shopId}';
                delete from public.inventory_counts where store_id='${shopId}';
                delete from public.stock_receipt_items where store_id='${shopId}';
                delete from public.stock_receipts where store_id='${shopId}';
                delete from public.sale_items where store_id='${shopId}';
                delete from public.sales where store_id='${shopId}';
                delete from public.customers where store_id='${shopId}';
                delete from public.audit_logs where store_id='${shopId}';
                delete from public.product_units where store_id='${shopId}';
                delete from public.products where store_id='${shopId}';
                delete from public.categories where store_id='${shopId}';
                delete from public.store_members where store_id='${shopId}';
                delete from public.stores where id='${shopId}';commit;`);
        }
        for(const user of users){const removed=await service.auth.admin.deleteUser(user.id);assert.ifError(removed.error);}
        assert.equal(counts(),baseline,'Existing business data counts preserved');
        console.log('Owned API fixtures removed; existing users/shops/products/sales preserved.');
    }catch{console.error('Owned API cleanup needs investigation; no existing data was reset.');process.exitCode=1;}
}
