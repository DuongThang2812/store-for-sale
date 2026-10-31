import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGateway } from '../gateway/app.js';
import { createRateLimitIdentity } from '../shared/rateLimitIdentity.js';

const env={SESSION_SECRET:'test-only-session-secret-at-least-32-bytes'};

test('Gateway verifies identity before Catalog, strips forged role headers and propagates correlation',async t=>{
    const calls=[];
    const app=await buildGateway({env,logger:false,transport:async(url,options)=>{calls.push({url,options});return Response.json({ok:true});}});t.after(()=>app.close());
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
        const app=await buildGateway({env,logger:false,transport:async()=>{calls++;return Response.json({secret:'private'},{status});}});t.after(()=>app.close());
        const result=await app.inject('/api/v1/products');
        assert.equal(result.statusCode,status===500?503:status);assert.equal(calls,1);assert.ok(!result.body.includes('private'));
    }
});

test('Gateway limits login per client IP and never forwards caller-supplied rate identity',async t=>{
    const calls=[];
    const app=await buildGateway({env,logger:false,transport:async(_url,options)=>{
        calls.push(options.headers);return Response.json({ok:true});
    }});t.after(()=>app.close());
    const login=(remoteAddress,headers={})=>app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress,
        headers,payload:{email:'owner@example.invalid',password:'wrong'}});
    for(let i=0;i<10;i++) assert.equal((await login('198.51.100.10',{
        'x-bin-client-ip':'192.0.2.55','x-bin-client-ip-signature':'forged',
    })).statusCode,200);
    assert.equal((await login('198.51.100.10')).statusCode,429);
    assert.equal((await login('198.51.100.11')).statusCode,200);
    const identity=createRateLimitIdentity(env.SESSION_SECRET);
    assert.equal(identity.keyFor({headers:calls[0],ip:'127.0.0.1'}),'198.51.100.10');
    assert.equal(identity.keyFor({headers:{'x-bin-client-ip':'192.0.2.55','x-bin-client-ip-signature':'forged'},ip:'127.0.0.1'}),'127.0.0.1');
});

test('Gateway trusts forwarded IP only from configured proxy CIDRs',async t=>{
    const seen=[];
    const app=await buildGateway({env:{...env,TRUSTED_PROXY_CIDRS:'127.0.0.1/32'},logger:false,
        transport:async(_url,options)=>{seen.push(options.headers);return Response.json({ok:true});}});t.after(()=>app.close());
    await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:'127.0.0.1',
        headers:{'x-forwarded-for':'198.51.100.20'},payload:{email:'a@example.invalid',password:'wrong'}});
    await app.inject({method:'POST',url:'/api/v1/auth/login',remoteAddress:'198.51.100.30',
        headers:{'x-forwarded-for':'198.51.100.99'},payload:{email:'a@example.invalid',password:'wrong'}});
    const identity=createRateLimitIdentity(env.SESSION_SECRET);
    assert.equal(identity.keyFor({headers:seen[0],ip:'127.0.0.1'}),'198.51.100.20');
    assert.equal(identity.keyFor({headers:seen[1],ip:'127.0.0.1'}),'198.51.100.30');
});
