export const uuid = { type: 'string', format: 'uuid' };
export const page = { type: 'object', additionalProperties: false, properties: {
    offset: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 30 },
    query: { type: 'string', maxLength: 120 },
} };
export const shopQuery = { ...page, required: ['shopId'], properties: { ...page.properties, shopId: uuid } };
export const errorSchema = { type: 'object', additionalProperties: false, required: ['success','error','requestId'], properties: {
    success: { type: 'boolean', const: false }, requestId: { type: 'string' },
    error: { type: 'object', required: ['code','message','details'], properties: {
        code: { type: 'string' }, message: { type: 'string' }, details: { type: ['object','null'], additionalProperties: true },
    } },
} };
export const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
export function documented({ summary, description, tags, body, querystring, params, response, publicRoute = false }) {
    return { summary, description, tags, ...(body && { body }), ...(querystring && { querystring }), ...(params && { params }),
        headers: { type: 'object', properties: { 'x-csrf-token': {type:'string',description:'Copy csrfToken from GET /api/v1/auth/session for every mutation.'} } },
        security: publicRoute ? [] : [{ CookieSession: [] }],
        response: { ...(response || {}), ...Object.fromEntries([400,401,403,404,409,429,500,503].map(code => [code,errorSchema])) } };
}
