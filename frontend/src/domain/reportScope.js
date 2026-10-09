/** A verified session object, shop and reload token own each read response. */
export function reportScopeMatches(state, scope) {
    return !!state && scope.dataMode === 'supabase' && scope.role === 'owner'
        && state.user === scope.user && state.storeId === scope.storeId
        && state.revision === scope.revision;
}
