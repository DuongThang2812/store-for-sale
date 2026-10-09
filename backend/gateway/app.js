import { createServer } from '../shared/server.js';
import { ApiError } from '../shared/errors.js';

export async function buildGateway({env=process.env,logger=true,transport=fetch}={}) {
    const targets = { auth: env.AUTH_SERVICE_URL || 'http://127.0.0.1:8081', catalog: env.CATALOG_SERVICE_URL || 'http://127.0.0.1:8082',inventory:env.INVENTORY_SERVICE_URL || 'http://127.0.0.1:8083' };
    targets.sales=env.SALES_SERVICE_URL||'http://127.0.0.1:8084';
    targets.debt=env.DEBT_SERVICE_URL||'http://127.0.0.1:8085';
    targets.reporting=env.REPORTING_SERVICE_URL||'http://127.0.0.1:8086';
    const aggregate = async () => {
        const documents = await Promise.all(Object.entries(targets).map(async ([name,url])=>{
            const response = await transport(`${url}/openapi.json`,{signal:AbortSignal.timeout(5000)});
            if (!response.ok) throw new ApiError('CONNECTION_FAILED',503);
            return {name,spec:await response.json()};
        }));
        return {openapi:'3.0.3',info:{title:'BIN API Gateway',version:'1.0.0'},servers:[{url:'/'}],
            paths:Object.assign({},...documents.map(({spec})=>spec.paths)),
            components:{securitySchemes:{CookieSession:{type:'apiKey',in:'cookie',name:env.NODE_ENV==='production'?'__Host-bin-session':'bin-session'}},
                schemas:Object.assign({},...documents.map(({spec})=>spec.components?.schemas || {}))},
            tags:documents.flatMap(({spec})=>spec.tags || [])};
    };
    const {app}=await createServer({name:'gateway',env,gateway:true,logger,openapiProvider:aggregate});
    const forwardHeaders = request => Object.fromEntries(['cookie','origin','content-type','x-csrf-token','idempotency-key']
        .filter(key=>typeof request.headers[key]==='string').map(key=>[key,request.headers[key]]).concat([['x-correlation-id',request.id]]));
    async function proxy(request,reply,service) {
        try {
            const headers=forwardHeaders(request);
            if (service!=='auth') {
                const verification=await transport(`${targets.auth}/api/v1/auth/me`,{headers,signal:AbortSignal.timeout(12000)});
                if (!verification.ok) {
                    if ([401,403].includes(verification.status)) throw new ApiError(verification.status===401?'SESSION_EXPIRED':'FORBIDDEN',verification.status);
                    throw new ApiError('CONNECTION_FAILED',503);
                }
            }
            const response=await transport(`${targets[service]}${request.url}`,{method:request.method,headers,
                ...(request.body!==undefined && {body:JSON.stringify(request.body)}),signal:AbortSignal.timeout(20000)});
            const cookies=response.headers.getSetCookie?.() || [];
            if (cookies.length) reply.header('set-cookie',cookies);
            if (response.headers.get('retry-after')) reply.header('retry-after',response.headers.get('retry-after'));
            reply.type('application/json').code(response.status);
            return await response.text();
        } catch(error) { if(error instanceof ApiError) throw error; throw new ApiError('CONNECTION_FAILED',503); }
    }
    for (const [prefix,service] of [['auth','auth'],['products','catalog'],['categories','catalog'],['suppliers','catalog'],['inventory','inventory'],['sales','sales'],['activity','sales'],['customers','debt'],['debts','debt'],['reports','reporting']]) {
        for(const path of [`/api/v1/${prefix}`,`/api/v1/${prefix}/*`]) app.route({method:['GET','POST','PUT','PATCH','DELETE'],url:path,
            schema:{hide:true},handler:(request,reply)=>proxy(request,reply,service)});
    }
    app.get('/health/services',{schema:{tags:['System'],summary:'Bounded dependency health'}},async(_request,reply)=>{
        const services=await Promise.all(Object.entries(targets).map(async([name,url])=>{
            try{const response=await transport(`${url}/health`,{signal:AbortSignal.timeout(3000)});return {name,healthy:response.ok};}
            catch{return{name,healthy:false};}
        }));
        if(services.some(s=>!s.healthy))reply.code(503);
        return{services};
    });
    return app;
}
