import { createClient } from 'npm:@supabase/supabase-js@2';
import { createAdminReader } from './reads.js';
import { AdminRateLimitError, createAdminActionExecutor } from './actions.js';
import { ApplicationError, ERROR_MESSAGES, publicErrorBody } from '../_shared/applicationErrors.js';

const url = Deno.env.get('SUPABASE_URL');
const publicKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const allowedOrigins = new Set((Deno.env.get('ADMIN_ALLOWED_ORIGINS') ||
  'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim()));
if (!url || !publicKey || !serviceKey) throw new Error('Admin API chưa được cấu hình.');

const authClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function json(body, status, origin, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders };
  if (origin && allowedOrigins.has(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
    headers['access-control-expose-headers'] = 'Retry-After';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function problem(message, status, origin) {
  const code = Object.keys(ERROR_MESSAGES).find(key => ERROR_MESSAGES[key] === message)
    || (status === 401 ? 'SESSION_EXPIRED' : status === 403 ? 'FORBIDDEN'
      : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'REQUEST_FAILED' : 'INVALID_REQUEST');
  return json({ code, error: ERROR_MESSAGES[code] }, status, origin);
}

async function verifiedAdmin(request, origin) {
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer\s+[^\s]+$/i.test(authorization)) {
    return { response: problem('Cần đăng nhập để tiếp tục.', 401, origin) };
  }
  const jwt = authorization.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return { response: problem('Phiên đăng nhập đã hết hạn.', 401, origin) };
  }
  const actorId = userData.user.id;
  const { error: accessError } = await adminClient.rpc('require_active_platform_admin', {
    p_actor_id: actorId,
  });
  if (accessError) return { response: problem('Tài khoản không có quyền quản trị.', 403, origin) };
  const { data: assurance, error: assuranceError } =
    await authClient.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
  if (assuranceError || !assurance) {
    return { response: problem('Chưa kiểm tra được xác thực hai bước.', 401, origin) };
  }
  return { actorId, assurance };
}

async function callRpc(name, params) {
  const { data, error } = await adminClient.rpc(name, params);
  if (error) throw error;
  return data;
}

async function readBoundedBody(request, maxBytes = 16384) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

const readResource = createAdminReader(callRpc, targetId => adminClient.auth.admin.getUserById(targetId));
const readMetadata = createAdminReader(callRpc);

async function executeAction(actorId, action, origin) {
  const base = { p_actor_id: actorId, p_reason: action.reason, p_request_id: action.requestId };
  if (action.action === 'store_status') {
    return callRpc('admin_change_store_status', {
      ...base, p_store_id: action.targetId, p_new_status: action.status,
    });
  }
  if (action.action === 'admin_status') {
    return callRpc('admin_change_admin_status', {
      ...base, p_user_id: action.targetId, p_enable: action.enable,
    });
  }
  if (action.action === 'password_reset') {
    const user = await readMetadata(actorId, { resource: 'user', targetId: action.targetId });
    if (!user?.email) throw new ApplicationError('EMAIL_UNAVAILABLE');
    const appOrigin = origin || Deno.env.get('ADMIN_PUBLIC_APP_ORIGIN');
    if (!appOrigin || !allowedOrigins.has(appOrigin)) {
      throw new ApplicationError('RESET_ORIGIN_MISSING');
    }
    const recorded = await callRpc('admin_claim_password_reset', {
      ...base, p_user_id: action.targetId,
    });
    if (!recorded.should_send) {
      if (recorded.delivery_status === 'sent') return recorded;
      throw new ApplicationError('EMAIL_PENDING');
    }
    const { error: sendError } = await authClient.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${appOrigin}/reset-password`,
    });
    await callRpc('admin_finish_password_reset', {
      p_actor_id: actorId, p_request_id: action.requestId,
      p_attempt_id: recorded.attempt_id, p_sent: !sendError,
    });
    if (sendError) throw sendError;
    return { ...recorded, delivery_status: 'sent' };
  }
  // DB status/RLS is authoritative. Commit and audit before touching external
  // Auth; retries synchronize to the *current* status, even for an old request.
  // Auth failure does not undo a committed disable or silently re-enable RLS.
  const result = await callRpc('admin_change_user_status', {
    ...base, p_user_id: action.targetId, p_new_status: action.status,
  });
  const effective = await readMetadata(actorId, { resource: 'user', targetId: action.targetId });
  if (!effective) throw new Error('Không tìm thấy tài khoản.');
  const desiredBan = effective.account_status === 'disabled' ? '876000h' : 'none';
  const { error: authError } = await adminClient.auth.admin.updateUserById(action.targetId, {
    ban_duration: desiredBan,
  });
  if (authError) throw authError;
  return { ...result, effective_status: effective.account_status };
}

const mutate = createAdminActionExecutor(callRpc, executeAction);

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins.has(origin)) return problem('Nguồn gọi không được phép.', 403, null);
  if (request.method === 'OPTIONS') {
    const headers = {
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
      'access-control-max-age': '600',
    };
    if (origin) headers['access-control-allow-origin'] = origin;
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return problem('Chỉ nhận yêu cầu POST.', 405, origin);
  if (Number(request.headers.get('content-length') || 0) > 16384) {
    return problem('Yêu cầu quá lớn.', 413, origin);
  }
  try {
    const verified = await verifiedAdmin(request, origin);
    if (verified.response) return verified.response;
    // Content-Length is optional; cap streamed bytes before parsing JSON.
    const body = await readBoundedBody(request);
    if (body === null) {
      return problem('Yêu cầu quá lớn.', 413, origin);
    }
    const input = JSON.parse(body);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return problem('Yêu cầu chưa hợp lệ.', 400, origin);
    }
    if (input.type === 'status') {
      return json({ isAdmin: true, currentLevel: verified.assurance.currentLevel,
        nextLevel: verified.assurance.nextLevel }, 200, origin);
    }
    if (verified.assurance.currentLevel !== 'aal2') {
      return problem('Cần xác thực hai bước trước khi quản trị.', 403, origin);
    }
    if (input.type === 'read') {
      const data = await readResource(verified.actorId, input);
      if (data === null) return problem('Không tìm thấy dữ liệu.', 404, origin);
      return json({ data: input.resource === 'system' ? { ...data, auth_ok: true, edge_ok: true } : data }, 200, origin);
    }
    if (input.type === 'action') {
      const data = await mutate(verified.actorId, input, origin);
      return json({ data }, 200, origin);
    }
    return problem('Yêu cầu chưa hợp lệ.', 400, origin);
  } catch (error) {
    if (error instanceof AdminRateLimitError) {
      return json({ code: 'RATE_LIMITED', error: ERROR_MESSAGES.RATE_LIMITED, retryAfter: error.retryAfter }, 429, origin,
        { 'retry-after': String(error.retryAfter) });
    }
    const response = publicErrorBody(error);
    return json(response.body, response.status, origin);
  }
});
