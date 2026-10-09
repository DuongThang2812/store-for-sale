import { createServer } from '../../shared/server.js';
import { createIdentityProvider } from '../../shared/identity.js';
import { createDatabase } from '../../shared/database.js';
import { createAuthRepository } from './repository.js';
import { createAuthApplication } from './application.js';
import { registerAuthRoutes } from './controller.js';
export async function buildAuthService({env=process.env,identity,repository,logger=true}={}) {
    identity ||= createIdentityProvider(env);
    const db = repository ? null : createDatabase(env.AUTH_DATABASE_URL,'auth');
    repository ||= createAuthRepository(db);
    const { app,session } = await createServer({name:'auth-service',env,identity,logger});
    registerAuthRoutes(app,session,createAuthApplication(identity,repository));
    if (db) app.addHook('onClose',()=>db.close());
    return app;
}
