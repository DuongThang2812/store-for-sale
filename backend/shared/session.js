import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors.js';

export function createSessionSecurity({ secret, secure = false }) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET must have at least 32 characters');
    const key = createHash('sha256').update(secret).digest();
    const cookieName = secure ? '__Host-bin-session' : 'bin-session';
    const csrfCookie = secure ? '__Host-bin-csrf' : 'bin-csrf';
    const options = { path: '/', secure, sameSite: 'strict' };
    const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b)
        && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    const csrfMac = value => createHmac('sha256', key).update(`csrf:${value}`).digest('base64url');
    return {
        cookieName, csrfCookie,
        seal(session) {
            const iv = randomBytes(12);
            const cipher = createCipheriv('aes-256-gcm', key, iv);
            cipher.setAAD(Buffer.from(cookieName));
            const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
            return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
        },
        read(request) {
            const cookie = request.cookies?.[cookieName];
            if (!cookie) return null;
            try {
                if (cookie.length > 6000) throw new Error();
                const packed = Buffer.from(cookie, 'base64url');
                const cipher = createDecipheriv('aes-256-gcm', key, packed.subarray(0, 12));
                cipher.setAAD(Buffer.from(cookieName)); cipher.setAuthTag(packed.subarray(12, 28));
                const session = JSON.parse(Buffer.concat([cipher.update(packed.subarray(28)), cipher.final()]));
                if (!session.accessToken || !session.refreshToken || !Number.isFinite(session.expiresAt)) throw new Error();
                return session;
            } catch { throw new ApiError('SESSION_EXPIRED', 401); }
        },
        write(reply, session) {
            const value = this.seal({ accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at });
            if (value.length > 3800) throw new ApiError('REQUEST_FAILED', 500);
            reply.setCookie(cookieName, value, { ...options, httpOnly: true, maxAge: 30 * 86400 });
        },
        clear(reply) { reply.clearCookie(cookieName, { ...options, httpOnly: true }); },
        csrf(request, reply) {
            const current = request.cookies?.[csrfCookie];
            const parts = current?.split('.') || [];
            if (parts.length === 2 && same(parts[1], csrfMac(parts[0]))) return current;
            const nonce = randomBytes(24).toString('base64url');
            const token = `${nonce}.${csrfMac(nonce)}`;
            reply.setCookie(csrfCookie, token, { ...options, httpOnly: false, maxAge: 86400 });
            return token;
        },
        checkCsrf(request) {
            const cookie = request.cookies?.[csrfCookie];
            const parts = cookie?.split('.') || [];
            if (parts.length !== 2 || !same(parts[1], csrfMac(parts[0])) || !same(cookie, request.headers['x-csrf-token'])) {
                throw new ApiError('FORBIDDEN', 403);
            }
        },
    };
}
