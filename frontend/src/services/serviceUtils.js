import { toApplicationError } from '../../../backend/supabase/functions/_shared/applicationErrors.js';

/** Fail with safe UI text; preserve codes/cause and never switch to demo. */
export async function unwrap(request) {
    try {
        const { data, error } = await request;
        if (error) throw error;
        return data;
    } catch (error) {
        throw toApplicationError(error);
    }
}

export function requiredText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} không được để trống.`);
    return value.trim();
}

export function requireUuid(value, label = 'ID') {
    if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${label} phải là UUID hợp lệ.`);
    return value;
}

export function pageRange({ offset = 0, limit = 100 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error('Phân trang cần offset >= 0 và limit từ 1 đến 200.');
    return { offset, limit, end: offset + limit - 1 };
}
