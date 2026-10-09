import { parseAction } from './validation.js';

export class AdminRateLimitError extends Error {
  constructor(retryAfter) {
    super(`Bạn thao tác quá nhanh. Vui lòng chờ ${retryAfter} giây rồi thử lại.`);
    this.name = 'AdminRateLimitError';
    this.retryAfter = retryAfter;
  }
}

// Keep admission before every business RPC, metadata read or external Auth
// action. An unavailable/malformed admission result fails closed.
export function createAdminActionExecutor(callRpc, execute) {
  return async (actorId, input, origin) => {
    const action = parseAction(input);
    const admitted = await callRpc('admin_admit_action', {
      p_actor_id: actorId, p_request_id: action.requestId,
      p_action: action.action, p_target_id: action.targetId, p_reason: action.reason,
      p_status: ['store_status', 'user_status'].includes(action.action) ? action.status : null,
      p_enable: action.action === 'admin_status' ? action.enable : null,
    });
    if (admitted?.allowed === false && Number.isInteger(admitted.retry_after)
      && admitted.retry_after >= 1 && admitted.retry_after <= 60) {
      throw new AdminRateLimitError(admitted.retry_after);
    }
    if (admitted?.allowed !== true) throw new Error('Chưa kiểm tra được giới hạn quản trị.');
    return execute(actorId, action, origin);
  };
}
