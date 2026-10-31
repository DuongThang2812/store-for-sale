import { createHmac, timingSafeEqual } from 'node:crypto';

const CLIENT_IP = 'x-bin-client-ip';
const SIGNATURE = 'x-bin-client-ip-signature';

export function createRateLimitIdentity(secret) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('SESSION_SECRET must have at least 32 characters');
    }
    const mac = address => createHmac('sha256', secret).update(`rate-limit:${address}`).digest('hex');
    return {
        forward(address) {
            return { [CLIENT_IP]: address, [SIGNATURE]: mac(address) };
        },
        keyFor(request) {
            const address = request.headers[CLIENT_IP];
            const signature = request.headers[SIGNATURE];
            if (typeof address === 'string' && address.length <= 64
                && typeof signature === 'string' && /^[0-9a-f]{64}$/.test(signature)
                && timingSafeEqual(Buffer.from(signature), Buffer.from(mac(address)))) {
                return address;
            }
            // Direct calls and forged forwarding headers are limited by their
            // actual socket address, never by a caller-supplied IP header.
            return request.ip;
        },
    };
}
