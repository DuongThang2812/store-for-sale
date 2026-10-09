import { documented, object, uuid } from '../../shared/contracts.js';
const credentials = { email: { type: 'string',format: 'email', maxLength: 254 }, password: { type: 'string',minLength: 1,maxLength: 1024 } };
const user = object({ id: uuid,email: { type: 'string' },name: { type: 'string' } });
const authResult = object({ user: { anyOf: [user,{type:'null'}] }, csrfToken: {type:'string'}, requiresEmailConfirmation: {type:'boolean'} },['user','csrfToken']);
export function registerAuthRoutes(app, security, application) {
    const base = '/api/v1/auth';
    const schema = options => documented({ tags: ['Auth'],...options });
    const deliver = (request,reply,result) => {
        if (result.session) security.write(reply,result.session);
        return { user: result.user,csrfToken: security.csrf(request,reply),requiresEmailConfirmation: result.requiresEmailConfirmation || false };
    };
    app.get(`${base}/session`, { config: {publicRoute:true},schema: schema({ publicRoute:true,summary:'Current verified session / CSRF',description:'Returns presentation identity; never returns access/refresh tokens.',response:{200:authResult} }) }, async (request,reply) => {
        let user = null;
        try { const session = security.read(request); if (session) user = await application.current(session); }
        catch (error) { if (![401,403].includes(error.statusCode)) throw error; security.clear(reply); }
        return { user,csrfToken:security.csrf(request,reply) };
    });
    app.post(`${base}/login`, { config:{publicRoute:true,rateLimit:{max:10,timeWindow:'1 minute'}}, schema:schema({ publicRoute:true,summary:'Đăng nhập',description:'Supabase Auth verifies credentials; backend checks active profile and sets an encrypted HttpOnly session cookie. Requires X-CSRF-Token.',body:object(credentials),response:{200:authResult} }) },async(request,reply)=>deliver(request,reply,await application.login(request.body)));
    app.post(`${base}/register`, { config:{publicRoute:true,rateLimit:{max:5,timeWindow:'1 minute'}},schema:schema({ publicRoute:true,summary:'Đăng ký',description:'No local password table. May require email confirmation.',body:object({...credentials,password:{...credentials.password,minLength:8},name:{type:'string',minLength:1,maxLength:120}}),response:{201:authResult} }) },async(request,reply)=>{ reply.code(201); return deliver(request,reply,await application.register(request.body)); });
    app.post(`${base}/refresh`, { config:{publicRoute:true},schema:schema({ summary:'Refresh session',description:'Refresh token is read only from HttpOnly cookie; rotation replaces that cookie.',response:{200:authResult} }) },async(request,reply)=>deliver(request,reply,await application.refresh(security.read(request))));
    app.post(`${base}/logout`, { config:{publicRoute:true},schema:schema({ summary:'Đăng xuất',description:'Revoke this provider session and clear the browser cookie.',response:{200:object({success:{type:'boolean'}})} }) },async(request,reply)=>{ await application.logout(security.read(request)); security.clear(reply); return {success:true}; });
    app.get(`${base}/me`, {schema:schema({summary:'Verified current user',description:'Gateway/services may use this endpoint to verify an active identity.',response:{200:user}})},request=>application.current(request.session));
    app.get(`${base}/stores`,{schema:schema({summary:'My shop memberships',description:'Server identity determines which active memberships are returned.'})},request=>application.stores(request.identity.id));
    app.post(`${base}/stores`,{schema:schema({summary:'Create shop',description:'Atomic shop/owner membership creation. No role/userId fields accepted.',body:object({name:{type:'string',minLength:1,maxLength:120},businessType:{type:'string',enum:['grocery','fruit_shop']}}),response:{201:object({id:uuid})}})},async(request,reply)=>{ reply.code(201); return {id:await application.createStore(request.identity.id,request.body)}; });
}
