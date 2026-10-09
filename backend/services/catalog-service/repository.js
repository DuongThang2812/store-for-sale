const op=(name,types)=>({name:`catalog_api.${name}`,types});
export function createCatalogRepository(db) {
    return {
        products:(actor,shopId,options)=>db.call(actor,op('products',['uuid','jsonb']),[shopId,options]),
        product:(actor,shopId,id)=>db.call(actor,op('product',['uuid','uuid']),[shopId,id]),
        saveProduct:(actor,input,id)=>db.call(actor,op('save_product',['uuid','uuid','uuid','jsonb']),[input.shopId,input.requestId,id,input]),
        categories:(actor,shopId,options)=>db.call(actor,op('categories',['uuid','jsonb']),[shopId,options]),
        saveCategory:(actor,input,id)=>db.call(actor,op('save_category',['uuid','text','uuid']),[input.shopId,input.name,id]),
        suppliers:(actor,shopId,options)=>db.call(actor,op('suppliers',['uuid','jsonb']),[shopId,options]),
        saveSupplier:(actor,input,id)=>db.call(actor,op('save_supplier',['uuid','jsonb','uuid']),[input.shopId,input,id]),
    };
}
