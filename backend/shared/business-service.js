import {createServer} from './server.js';
import {createIdentityProvider} from './identity.js';
import {createDatabase} from './database.js';

// Route/connection infrastructure only; domain controllers and fixed contracts
// are passed by their own service, not discovered from a browser RPC/table name.
export async function buildBusinessService({name,env=process.env,identity,repository,createRepository,registerRoutes,logger=true}){
    identity ||= createIdentityProvider(env);
    const db=repository?null:createDatabase(env[`${name.toUpperCase()}_DATABASE_URL`],name);
    repository ||= createRepository(db);
    const {app}=await createServer({name:`${name}-service`,env,identity,logger});
    registerRoutes(app,repository);
    if(db)app.addHook('onClose',()=>db.close());
    return app;
}
