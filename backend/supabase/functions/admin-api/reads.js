import { detailResources, parseRead } from './validation.js';
import { readAuthenticationSummary } from './authSummary.js';

export function createAdminReader(callRpc, readAuthUser) {
  return async (actorId, input) => {
    const parsed = parseRead(input);
    if (detailResources.has(parsed.resource)) {
      const data = await callRpc('admin_read_detail', { p_actor_id: actorId, p_resource: parsed.resource,
        p_target_id: parsed.targetId, p_offset: parsed.offset, p_limit: parsed.limit, p_sort: parsed.sort });
      if (data !== null && parsed.resource === 'user' && readAuthUser) {
        return { ...data, authentication_summary: await readAuthenticationSummary(readAuthUser, parsed.targetId) };
      }
      return data;
    }
    return callRpc('admin_read_filtered', {
      p_actor_id: actorId, p_resource: parsed.resource,
      p_offset: parsed.offset, p_limit: parsed.limit, p_query: parsed.query, p_filter: parsed.filter,
      p_target_id: parsed.targetId, p_sort: parsed.sort, p_business_type: parsed.businessType,
      p_admin_id: parsed.adminId, p_action: parsed.action, p_event_user_id: parsed.eventUserId,
      p_from: parsed.from, p_to: parsed.to,
    });
  };
}
