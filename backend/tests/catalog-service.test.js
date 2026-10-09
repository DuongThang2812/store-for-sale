import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogService } from '../services/catalog-service/app.js';
import { createSessionSecurity } from '../shared/session.js';
const uuid='f9300000-0000-4000-8000-000000000001';
const env={SESSION_SECRET:'test-catalog-only-secret-at-least-32-characters'};
const security=createSessionSecurity({secret:env.SESSION_SECRET});
const cookie=security.seal({accessToken:'access',refreshToken:'refresh',expiresAt:2000000000});
function fixture(calls){return {identity:{verify:async()=>({id:uuid})},repository:{
    products:async(...args)=>{calls.push(args);return [];},product:async()=>null,
    saveProduct:async(...args)=>{calls.push(args);throw Object.assign(new Error('private table diagnostics'),{code:'42501'});},
    categories:async()=>[],suppliers:async()=>[],saveCategory:async()=>uuid,saveSupplier:async()=>uuid}};}
test('Catalog receives server-verified actor and server pagination, no client role',async t=>{
    const calls=[];const app=await buildCatalogService({...fixture(calls),env,logger:false});t.after(()=>app.close());
    const result=await app.inject({url:`/api/v1/products?shopId=${uuid}&limit=2&query=cola`,headers:{cookie:`bin-session=${cookie}`,'x-role':'owner'}});
    assert.equal(result.statusCode,200);assert.equal(calls[0][0],uuid);assert.equal(calls[0][2].limit,2);
    assert.equal((await app.inject({url:`/api/v1/products?shopId=${uuid}&limit=999`,headers:{cookie:`bin-session=${cookie}`}})).statusCode,400);
});
test('Catalog command schema rejects stock/role injection and server errors are sanitized',async t=>{
    const calls=[];const app=await buildCatalogService({...fixture(calls),env,logger:false});t.after(()=>app.close());
    const result=(await app.inject('/openapi.json')).json();
    assert.ok(result.paths['/api/v1/products/{id}'].put.requestBody);
    const reply={setCookie:()=>{}};const csrf=security.csrf({cookies:{}},reply);
    const headers={cookie:`bin-session=${cookie}; bin-csrf=${csrf}`,'x-csrf-token':csrf};
    const input={shopId:uuid,requestId:uuid,name:'Cola',category:'Nước',productGroup:'drinks',baseUnit:'chai',expectedVersion:1,
        units:[{key:'base',name:'chai',factor:1,salePrice:10000,canPurchase:false,canSell:true}]};
    for(const extra of [{stockBase:999999},{role:'owner'},{openingStock:5},{finalTotal:1}]){
        const denied=await app.inject({method:'PUT',url:`/api/v1/products/${uuid}`,headers,payload:{...input,...extra}});
        assert.equal(denied.statusCode,400);
    }
    assert.equal(calls.length,0);
    const denied=await app.inject({method:'PUT',url:`/api/v1/products/${uuid}`,headers,payload:input});
    assert.equal(denied.statusCode,403);assert.ok(!denied.body.includes('private table diagnostics'));
});
