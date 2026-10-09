import { ERROR_MESSAGES, toApplicationError } from '../supabase/functions/_shared/applicationErrors.js';

export class ApiError extends Error {
    constructor(code, statusCode) { super(ERROR_MESSAGES[code] || 'Yêu cầu chưa thực hiện được.'); this.code = code; this.statusCode = statusCode; }
}
export function publicFailure(error, requestId) {
    const known = error instanceof ApiError;
    const converted = toApplicationError(error);
    const code = error.statusCode === 429 ? 'RATE_LIMITED' : error.validation || error.code?.startsWith('FST_ERR_CTP_') ? 'INVALID_REQUEST' : known ? error.code : converted.applicationCode || 'REQUEST_FAILED';
    const status = error.validation ? 400 : known ? error.statusCode
        : error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : ['23505', '40001', '40P01'].includes(error.code) ? 409
        : error.statusCode === 429 ? 429 : error.code?.startsWith('FST_ERR_CTP_') ? 400
        : error.code === 'P0001' || error.code === '22023' ? 400 : 500;
    return { status, body: { success: false, error: { code, message: ERROR_MESSAGES[code] || 'Yêu cầu chưa thực hiện được.', details: null }, requestId } };
}
