export function canUseShopOperation(store, operation) {
    if (!['sell', 'receiveStock', 'manageDebt', 'manageShop'].includes(operation)) return false;
    if (!store || store.memberActive === false || store.status !== 'active') return false;
    if (store.role === 'owner') return true;
    return store.permissions?.[operation] === true;
}
