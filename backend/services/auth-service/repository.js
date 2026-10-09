const profile = { name: 'auth_api.profile', types: [] };
const stores = { name: 'auth_api.stores', types: [] };
const createStore = { name: 'auth_api.create_shop', types: ['text','text'] };
export function createAuthRepository(db) {
    return { profile: actor => db.call(actor,profile), stores: actor => db.call(actor,stores),
        createStore: (actor,input) => db.call(actor,createStore,[input.name,input.businessType]) };
}
