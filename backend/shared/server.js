import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { randomUUID } from 'node:crypto';
import { createSessionSecurity } from './session.js';
import { ApiError, publicFailure } from './errors.js';

export async function createServer({ name, env = process.env, identity, gateway = false, logger = true, openapiProvider }) {
    const app = Fastify({ logger: logger ? { serializers: {
        req: req => ({ method: req.method, path: req.url.split('?')[0] }),
        res: res => ({ statusCode: res.statusCode }),
    }, redact: ['req.headers.authorization','req.headers.cookie','res.headers.set-cookie','password','token'] } : false,
        logController: new LogController({disableRequestLogging:true}), genReqId: () => randomUUID(), bodyLimit: 1024 * 1024,
        ajv: { customOptions: { removeAdditional: false } } });
    const origins = new Set((env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080').split(','));
    const session = gateway ? null : createSessionSecurity({ secret: env.SESSION_SECRET, secure: env.NODE_ENV === 'production' });
    await app.register(cookie);
    await app.register(cors, { origin: (origin, cb) => cb(null, !origin || origins.has(origin)), credentials: true });
    await app.register(rateLimit, { global: true, max: 150, timeWindow: '1 minute', errorResponseBuilder: request =>
        ({ success: false, error: { code: 'RATE_LIMITED', message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.', details: null }, requestId: request.id }) });
    await app.register(swagger, { openapi: { info: { title: `BIN ${name}`, version: '1.0.0', description: 'Cookie session; obtain CSRF from GET /api/v1/auth/session before mutations. No database credentials in client.' },
        components: { securitySchemes: { CookieSession: { type: 'apiKey', in: 'cookie', name: env.NODE_ENV === 'production' ? '__Host-bin-session' : 'bin-session' } } } } });
    if (env.NODE_ENV !== 'production') await app.register(swaggerUi, { routePrefix: '/swagger-ui', uiConfig: { withCredentials: true, persistAuthorization: false } });
    if (env.NODE_ENV !== 'production') app.get('/openapi.json', { schema: { hide: true } }, () => openapiProvider ? openapiProvider() : app.swagger());
    app.get('/health', { schema: { tags: ['System'], summary: 'Liveness', response: { 200: { type: 'object', properties: { service: { type: 'string' }, status: { type: 'string' } } } } } }, () => ({ service: name, status: 'ok' }));
    app.decorateRequest('identity', null);
    app.decorateRequest('session', null);
    app.addHook('onRequest', async (request, reply) => {
        const correlation = request.headers['x-correlation-id'];
        if (correlation && !/^[0-9a-f-]{36}$/i.test(correlation)) throw new ApiError('INVALID_REQUEST', 400);
        if (correlation) request.id = correlation;
        reply.header('x-correlation-id', request.id).header('cache-control', 'no-store');
        if (request.headers.origin && !origins.has(request.headers.origin)) throw new ApiError('FORBIDDEN', 403);
        if (['POST','PUT','PATCH','DELETE'].includes(request.method) && !gateway) session.checkCsrf(request);
    });
    app.addHook('preHandler', async request => {
        if (gateway || request.routeOptions.config.publicRoute || !request.url.startsWith('/api/')) return;
        request.session = session.read(request);
        request.identity = await identity.verify(request.session);
    });
    app.setErrorHandler((error, request, reply) => {
        const failure = publicFailure(error, request.id);
        request.log.warn({ correlationId: request.id, code: failure.body.error.code, status: failure.status }, 'Request rejected');
        reply.code(failure.status).send(failure.body);
    });
    app.setNotFoundHandler((request, reply) => reply.code(404).send(publicFailure(new ApiError('NOT_FOUND',404),request.id).body));
    app.addHook('onResponse', async (request, reply) => request.log.info({ correlationId: request.id,
        method: request.method, path: request.url.split('?')[0], status: reply.statusCode }, 'Request complete'));
    return { app, session };
}
