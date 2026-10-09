import {documented,object,uuid,shopQuery} from '../../shared/contracts.js';
export function registerSalesRoutes(app,repository){
    const schema=options=>documented({tags:['Sales'],...options});
    app.post('/api/v1/sales/checkout',{schema:schema({summary:'Checkout atomic',description:'Backend resolves price/conversion/stock/COGS/debt in one transaction. Never accepts total, stock or role. Retry keeps requestId.',body:object({shopId:uuid,requestId:uuid,
        paymentType:{type:'string',enum:['cash','credit']},customerId:uuid,
        items:{type:'array',minItems:1,maxItems:200,items:object({productId:uuid,unitKey:{type:'string',pattern:'^[a-z][a-z0-9_]{0,23}$'},quantity:{type:'number',exclusiveMinimum:0,maximum:999999},expectedVersion:{type:'integer',minimum:1}})}},['shopId','requestId','items'])})},r=>repository.checkout(r.identity.id,r.body));
    app.get('/api/v1/sales/:id/cancellation-preview',{schema:schema({summary:'Preview cancellation',description:'Owner-only server refund/debt/stock calculation with confirmation token.',params:object({id:uuid}),querystring:object({shopId:uuid})})},r=>repository.cancellationPreview(r.identity.id,r.query.shopId,r.params.id));
    app.post('/api/v1/sales/:id/cancel',{schema:schema({summary:'Cancel confirmed sale',description:'Server restores stock and reverses the original COGS/debt/cash atomically; previewToken rejects stale confirmation.',params:object({id:uuid}),body:object({shopId:uuid,requestId:uuid,reason:{type:'string',minLength:1,maxLength:300},previewToken:{type:'string',pattern:'^[0-9a-f]{64}$'}})})},r=>repository.cancel(r.identity.id,r.params.id,r.body));
    app.get('/api/v1/activity',{schema:schema({summary:'Paged shop activity',description:'Server controls history filters and hides finance/debt fields according to permission.',querystring:{...shopQuery,properties:{...shopQuery.properties,limit:{type:'integer',minimum:1,maximum:100,default:50},
        kind:{type:'string',enum:['sale','debt','cancel','stock','payment','adjustment','edit','restore']},customerId:uuid,productId:uuid}}})},r=>repository.activity(r.identity.id,r.query));
}
