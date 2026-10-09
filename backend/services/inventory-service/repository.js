const operation=(name,types)=>({name:`inventory_api.${name}`,types});
export function createInventoryRepository(db){return{
    balances:(actor,query)=>db.call(actor,operation('balances',['uuid','jsonb']),[query.shopId,query]),
    receive:(actor,input)=>db.call(actor,operation('receive',['uuid','uuid','jsonb','text','uuid']),[input.shopId,input.requestId,input.items,input.note||null,input.supplierId||null]),
    adjust:(actor,input)=>db.call(actor,operation('adjust',['uuid','uuid','bigint','text','uuid','text']),[input.shopId,input.productId,input.quantityBase,input.reason,input.requestId,input.note||null]),
    count:(actor,input)=>db.call(actor,operation('count_stock',['uuid','uuid','jsonb','text']),[input.shopId,input.requestId,input.items,input.note||null]),
    cost:(actor,shopId,productId)=>db.call(actor,operation('product_cost',['uuid','uuid']),[shopId,productId]),
    valueOpening:(actor,input)=>db.call(actor,operation('value_opening',['uuid','uuid','text','bigint','uuid']),[input.shopId,input.productId,input.unitKey,input.costPerUnit,input.requestId]),
};}
