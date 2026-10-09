import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGateway } from '../gateway/app.js';

test('Gateway verifies identity before Catalog, strips forged role headers and propagates correlation',async t=>{
    const calls=[];
    const app=await buildGateway({logger:false,transport:async(url,options)=>{calls.push({url,options});return Response.json({ok:true});}});t.after(()=>app.close());
    const result=await app.inject({url:'/api/v1/products?shopId=abc',headers:{cookie:'session=opaque','x-user-id':'forged','x-role':'owner'}});
    assert.equal(result.statusCode,200);assert.equal(calls.length,2);
    assert.match(calls[0].url,/auth\/me$/);assert.match(calls[1].url,/products/);
    assert.equal(calls[1].options.headers['x-user-id'],undefined);
    assert.equal(calls[1].options.headers['x-role'],undefined);
    assert.equal(calls[0].options.headers['x-correlation-id'],calls[1].options.headers['x-correlation-id']);
});

test('Gateway fails closed without identity or upstream and sanitizes errors',async t=>{
    for(const status of [401,403,500]){
        let calls=0;
        const app=await buildGateway({logger:false,transport:async()=>{calls++;return Response.json({secret:'private'},{status});}});t.after(()=>app.close());
        const result=await app.inject('/api/v1/products');
        assert.equal(result.statusCode,status===500?503:status);assert.equal(calls,1);assert.ok(!result.body.includes('private'));
    }
});
