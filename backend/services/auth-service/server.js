import { buildAuthService } from './app.js';
const app = await buildAuthService();
await app.listen({host:process.env.HOST || '127.0.0.1',port:Number(process.env.PORT || 8081)});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>app.close());
