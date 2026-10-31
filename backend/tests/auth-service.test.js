import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthService } from '../services/auth-service/app.js';
import { createSessionSecurity } from '../shared/session.js';
import { ApiError } from '../shared/errors.js';
import { createRateLimitIdentity } from '../shared/rateLimitIdentity.js';

const user={id:'f9300000-0000-4000-8000-000000000001',email:'owner@example.invalid'};
const env={SESSION_SECRET:'test-only-session-secret-at-least-32-bytes',ALLOWED_ORIGINS:'http://localhost:5173,http://localhost:8080'};
function fixture(){
    const session={access_token:'private-access',refresh_token:'private-refresh',expires_at:2000000000};
    const identity={verify:async value=>{if(value?.accessToken!=='private-access')throw new ApiError('SESSION_EXPIRED',401);return user;},
        client:()=>({auth:{signInWithPassword:async input=>input.password==='correct-password'?{data:{session,user}}:{error:{message:'private diagnostic'}},
            refreshSession:async()=>({data:{session,user}}),admin:{signOut:async()=>({error:null})}}})};
    const repository={profile:async()=>({accountStatus:'active',name:'Owner'}),stores:async()=>[],createStore:async()=>user.id};
    return {identity,repository};
}
function cookieHeaders(response){return response.cookies.map(c=>`${c.name}=${c.value}`).join('; ');}

test('real controller login uses encrypted HttpOnly cookie, CSRF and sanitized JSON',async t=>{
    const app=await buildAuthService({...fixture(),env,logger:false});t.after(()=>app.close());
    const initial=await app.inject({url:'/api/v1/auth/session'});
    const headers={cookie:cookieHeaders(initial),'x-csrf-token':initial.json().csrfToken,origin:'http://localhost:5173'};
    const result=await app.inject({method:'POST',url:'/api/v1/auth/login',headers,payload:{email:user.email,password:'correct-password'}});
    assert.equal(result.statusCode,200);
    assert.deepEqual(result.json().user,{...user,name:'Owner'});
    assert.ok(!result.body.includes('private-access') && !result.body.includes('private-refresh'));
    assert.ok([].concat(result.headers['set-cookie']).some(value=>value.includes('HttpOnly') && value.includes('SameSite=Strict')));
    const sessionCookie=result.cookies.find(c=>c.name==='bin-session');
    assert.ok(!sessionCookie.value.includes('private-access'));
    const authenticated={...headers,cookie:`${headers.cookie}; ${sessionCookie.name}=${sessionCookie.value}`};
    assert.equal((await app.inject({url:'/api/v1/auth/me',headers:authenticated})).statusCode,200);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/refresh',headers:authenticated})).statusCode,200);
    const loggedOut=await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:authenticated});
    assert.equal(loggedOut.statusCode,200);
    assert.ok([].concat(loggedOut.headers['set-cookie']).some(value=>value.includes('Max-Age=0')));
});

test('Auth rejects absent session, CSRF, forged cookie, hostile Origin and mass assignment',async t=>{
    const app=await buildAuthService({...fixture(),env,logger:false});t.after(()=>app.close());
    assert.equal((await app.inject('/api/v1/auth/me')).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{email:user.email,password:'correct-password'}})).statusCode,403);
    const initial=await app.inject('/api/v1/auth/session');
    const headers={cookie:cookieHeaders(initial),'x-csrf-token':initial.json().csrfToken};
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{...headers,origin:'https://evil.invalid'},payload:{email:user.email,password:'correct-password'}})).statusCode,403);
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',headers,payload:{email:user.email,password:'correct-password',role:'owner'}})).statusCode,400);
    const bad=await app.inject({method:'POST',url:'/api/v1/auth/login',headers,payload:{email:user.email,password:'wrong'}});
    assert.equal(bad.statusCode,401);assert.ok(!bad.body.includes('private diagnostic'));
    assert.equal((await app.inject({url:'/api/v1/auth/me',headers:{cookie:'bin-session=forged'}})).statusCode,401);
});

test('Auth Swagger documents session security, DTOs, validation and errors',async t=>{
    const app=await buildAuthService({...fixture(),env,logger:false});t.after(()=>app.close());
    const spec=(await app.inject('/openapi.json')).json();
    assert.equal(spec.components.securitySchemes.CookieSession.in,'cookie');
    assert.ok(spec.paths['/api/v1/auth/login'].post.requestBody);
    assert.ok(spec.paths['/api/v1/auth/login'].post.responses['401']);
    assert.equal((await app.inject('/swagger-ui/')).statusCode,200);
});

test('disabled DB profile prevents successful login even if provider accepted credentials',async t=>{
    const deps=fixture();deps.repository.profile=async()=>({accountStatus:'disabled',name:'Owner'});
    const app=await buildAuthService({...deps,env,logger:false});t.after(()=>app.close());
    const initial=await app.inject('/api/v1/auth/session');
    const result=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{cookie:cookieHeaders(initial),'x-csrf-token':initial.json().csrfToken},payload:{email:user.email,password:'correct-password'}});
    assert.equal(result.statusCode,403);assert.equal(result.cookies.some(c=>c.name==='bin-session'),false);
});

test('session encryption rejects tampering and production cookie flags enforce Secure',()=>{
    const security=createSessionSecurity({secret:env.SESSION_SECRET,secure:true});
    const value=security.seal({accessToken:'a',refreshToken:'b',expiresAt:123});
    assert.deepEqual(security.read({cookies:{[security.cookieName]:value}}),{accessToken:'a',refreshToken:'b',expiresAt:123});
    assert.throws(()=>security.read({cookies:{[security.cookieName]:`x${value.slice(1)}`}}),ApiError);
    assert.equal(security.cookieName,'__Host-bin-session');
});

test('Auth service limits gateway clients separately and ignores unsigned IP headers',async t=>{
    const app=await buildAuthService({...fixture(),env,logger:false});t.after(()=>app.close());
    const initial=await app.inject('/api/v1/auth/session');
    const security={cookie:cookieHeaders(initial),'x-csrf-token':initial.json().csrfToken};
    const identity=createRateLimitIdentity(env.SESSION_SECRET);
    const login=address=>app.inject({method:'POST',url:'/api/v1/auth/login',headers:{...security,...identity.forward(address)},
        payload:{email:user.email,password:'correct-password'}});
    for(let i=0;i<10;i++) assert.equal((await login('198.51.100.10')).statusCode,200);
    assert.equal((await login('198.51.100.10')).statusCode,429);
    assert.equal((await login('198.51.100.11')).statusCode,200);
});

test('Auth registration rejects weak or overlong passwords before provider signup',async t=>{
    let signups=0;
    const deps=fixture();
    deps.identity.client=()=>({auth:{signUp:async()=>{signups++;return {data:{session:null,user:null},error:null};}}});
    const app=await buildAuthService({...deps,env,logger:false});t.after(()=>app.close());
    const initial=await app.inject('/api/v1/auth/session');
    const headers={cookie:cookieHeaders(initial),'x-csrf-token':initial.json().csrfToken};
    for(const password of ['weak','onlyletters','12345678','a1'.repeat(37),'á'.repeat(36)+'a1']) {
        const response=await app.inject({method:'POST',url:'/api/v1/auth/register',headers,
            payload:{email:user.email,name:'Owner',password}});
        assert.equal(response.statusCode,400);
    }
    assert.equal(signups,0);
});
