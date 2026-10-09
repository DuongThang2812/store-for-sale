const operation=(name,types)=>({name:`debt_api.${name}`,types});
export function createDebtRepository(db){return{
    customers:(actor,input)=>db.call(actor,operation('customers',['uuid','jsonb']),[input.shopId,input]),
    customer:(actor,shopId,id)=>db.call(actor,operation('customer',['uuid','uuid']),[shopId,id]),
    create:(actor,input)=>db.call(actor,operation('create_customer',['uuid','uuid','text','text','text']),[input.shopId,input.requestId,input.name,input.phone||null,input.note||null]),
    save:(actor,id,input)=>db.call(actor,operation('save_customer',['uuid','uuid','text','text','text']),[input.shopId,id,input.name,input.phone||null,input.note||null]),
    pay:(actor,id,input)=>db.call(actor,operation('pay',['uuid','uuid','bigint','uuid','text','text']),[input.shopId,id,input.amount,input.requestId,input.paymentMethod||'cash',input.note||null]),
};}
