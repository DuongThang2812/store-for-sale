import { createServer } from '../../shared/server.js';
import { createIdentityProvider } from '../../shared/identity.js';
import { createDatabase } from '../../shared/database.js';
import { createCatalogRepository } from './repository.js';
import { createCatalogApplication } from './application.js';
import { registerCatalogRoutes } from './controller.js';
export async function buildCatalogService({env=process.env,identity,repository,logger=true}={}) {
    identity ||= createIdentityProvider(env);
    const db=repository?null:createDatabase(env.CATALOG_DATABASE_URL,'catalog');
    repository ||= createCatalogRepository(db);
    const {app}=await createServer({name:'catalog-service',env,identity,logger});
    registerCatalogRoutes(app,createCatalogApplication(repository));
    if(db)app.addHook('onClose',()=>db.close());
    return app;
}
