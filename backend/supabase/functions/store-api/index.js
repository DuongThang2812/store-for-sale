import { ApplicationError, ERROR_MESSAGES } from '../_shared/applicationErrors.js';
import { mapStoreDto } from './mapper.js';

async function loadSupabaseFactory() {
  if (typeof Deno !== 'undefined') {
    const mod = await import('npm:@supabase/supabase-js@2');
    return mod.createClient;
  }
  const mod = await import('@supabase/supabase-js');
  return mod.createClient;
}

const url = (typeof Deno !== 'undefined' ? Deno?.env?.get('SUPABASE_URL') : null) || process?.env?.SUPABASE_URL;
const publicKey = (typeof Deno !== 'undefined' ? (Deno?.env?.get('SUPABASE_PUBLISHABLE_KEY') || Deno?.env?.get('SUPABASE_ANON_KEY')) : null) || process?.env?.SUPABASE_ANON_KEY;
const serviceKey = (typeof Deno !== 'undefined' ? Deno?.env?.get('SUPABASE_SERVICE_ROLE_KEY') : null) || process?.env?.SUPABASE_SERVICE_ROLE_KEY;

export function createStoreApiHandler({
  supabaseUrl = url,
  supabaseKey = publicKey,
  serviceRoleKey = serviceKey,
  authClientProvider,
  dbClientProvider,
} = {}) {
  let factoryPromise = null;
  const getClientFactory = () => {
    if (!factoryPromise) factoryPromise = loadSupabaseFactory();
    return factoryPromise;
  };

  const getAuthClient = async () => {
    if (authClientProvider) return authClientProvider();
    const create = await getClientFactory();
    return create(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  };

  const getDbClient = async () => {
    if (dbClientProvider) return dbClientProvider();
    const create = await getClientFactory();
    return create(supabaseUrl, serviceRoleKey || supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  };

  return async function handleRequest(request) {
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const origin = request.headers.get('origin') || '*';

    const corsHeaders = {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id, idempotency-key',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-expose-headers': 'x-correlation-id',
      'vary': 'Origin',
      'x-correlation-id': correlationId,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const jsonResponse = (body, status = 200) => {
      return new Response(JSON.stringify(body), { status, headers: corsHeaders });
    };

    const errorResponse = (code, status = 400, details = null) => {
      const message = ERROR_MESSAGES[code] || 'Yêu cầu chưa thực hiện được.';
      return jsonResponse({
        success: false,
        error: { code, message, details },
        requestId: correlationId,
      }, status);
    };

    try {
      // 1. Verify Authorization Bearer token
      const authHeader = request.headers.get('authorization') || '';
      if (!/^Bearer\s+[^\s]+$/i.test(authHeader)) {
        return errorResponse('SESSION_EXPIRED', 401);
      }
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();

      const authClient = await getAuthClient();
      const { data: userData, error: userError } = await authClient.auth.getUser(token);
      if (userError || !userData?.user?.id) {
        return errorResponse('SESSION_EXPIRED', 401);
      }
      const userId = userData.user.id;

      // 2. Route handling
      const reqUrl = new URL(request.url);
      const pathname = reqUrl.pathname.replace(/\/functions\/v1\/store-api/, '').replace(/\/api\/v1/, '') || '/';

      if (request.method === 'GET' && (pathname === '/stores' || pathname === '/' || pathname === '')) {
        const db = await getDbClient();

        // 3. Ensure user account is active
        const { data: profile, error: profileErr } = await db
          .from('profiles')
          .select('id,account_status,display_name')
          .eq('id', userId)
          .maybeSingle();

        if (profileErr) {
          return errorResponse('CONNECTION_FAILED', 503);
        }
        if (profile && profile.account_status !== 'active') {
          return errorResponse('FORBIDDEN', 403);
        }

        // 4. Query stores strictly by verified user ID (cannot spoof another user)
        const membershipFields = 'store_id,user_id,role,is_active,can_sell,can_receive_stock,can_manage_debt,permission_version,created_at,stores!inner(id,name,business_type,timezone,currency,status,contact_phone,address,settings_version,created_by,created_at,updated_at)';
        const { data: rows, error: storeErr } = await db
          .from('store_members')
          .select(membershipFields)
          .eq('user_id', userId)
          .eq('is_active', true)
          .order('created_at');

        if (storeErr) {
          return errorResponse('CONNECTION_FAILED', 503);
        }

        const flatRows = (rows || []).map(row => ({
          id: row.stores.id,
          name: row.stores.name,
          businessType: row.stores.business_type,
          timezone: row.stores.timezone,
          currency: row.stores.currency,
          status: row.stores.status,
          role: row.role,
          canSell: row.role === 'owner' || row.can_sell,
          canReceiveStock: row.role === 'owner' || row.can_receive_stock,
          canManageDebt: row.role === 'owner' || row.can_manage_debt,
          permissionVersion: row.permission_version,
          contactPhone: row.stores.contact_phone,
          address: row.stores.address,
          settingsVersion: row.stores.settings_version,
          createdBy: row.stores.created_by,
          createdAt: row.stores.created_at,
          updatedAt: row.stores.updated_at,
        }));

        const result = flatRows.map(mapStoreDto);
        return jsonResponse({
          success: true,
          data: result,
          requestId: correlationId,
        }, 200);
      }

      return errorResponse('NOT_FOUND', 404);
    } catch (err) {
      if (err instanceof ApplicationError) {
        return errorResponse(err.applicationCode, err.status || 500);
      }
      return errorResponse('REQUEST_FAILED', 500);
    }
  };
}

// In Deno runtime (Supabase Edge Function environment)
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve(createStoreApiHandler());
}
