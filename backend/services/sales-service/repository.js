const operation=(name,types)=>({name:`sales_api.${name}`,types});
export function createSalesRepository(db){return{
    checkout:(actor,input)=>db.call(actor,operation('checkout',['uuid','uuid','jsonb','text','uuid']),[input.shopId,input.requestId,input.items,input.paymentType||'cash',input.customerId||null]),
    cancellationPreview:(actor,shopId,id)=>db.call(actor,operation('cancellation_preview',['uuid','uuid']),[shopId,id]),
    cancel:(actor,id,input)=>db.call(actor,operation('cancel',['uuid','uuid','text','uuid','text']),[input.shopId,id,input.reason,input.requestId,input.previewToken]),
    activity:(actor,input)=>db.call(actor,operation('activity',['uuid','jsonb']),[input.shopId,input]),
};}
