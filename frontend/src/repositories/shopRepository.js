/**
 * Phase 0–1 shared READ contract (all methods return Promises).
 * Lists are paginated, default 100 / maximum 200. Never assume a list is the whole DB.
 * @typedef {Object} ShopRepository
 * @property {'demo'|'supabase'} mode
 * @property {function({offset?: number, limit?: number, activeOnly?: boolean}=): Promise<Array>} listProducts
 * @property {function(string): Promise<Object|null>} getProduct
 * @property {function({offset?: number, limit?: number, debtOnly?: boolean}=): Promise<Array>} listCustomers
 *
 * Cloud commands are exposed separately on supabaseShopRepository.commands.
 * Existing demo writes remain in useShopStore until the transaction UI is connected.
 */

/** Explicit mode only; never silently fall back to demo after a cloud error. */
export async function createShopRepository({ mode, storeId, clientProvider, getDemoState } = {}) {
    if (mode === 'supabase') {
        const { createSupabaseShopRepository } = await import('./supabaseShopRepository.js');
        return createSupabaseShopRepository({ storeId, clientProvider });
    }
    if (mode === 'demo') {
        const { createDemoShopRepository } = await import('./demoShopRepository.js');
        const getState = getDemoState ?? (await import('../stores/useShopStore.js')).useShopStore.getState;
        return createDemoShopRepository(getState);
    }
    throw new Error('Chọn rõ repository mode: demo hoặc supabase.');
}
