import { documented,object,uuid,shopQuery } from '../../shared/contracts.js';
import { productInput,productResponse } from './contracts.js';
export function registerCatalogRoutes(app,application) {
    const schema=options=>documented({tags:['Catalog'],...options});
    const listQuery={...shopQuery,properties:{...shopQuery.properties,activeOnly:{type:'boolean'}}};
    const id=object({id:uuid});
    app.get('/api/v1/products',{schema:schema({summary:'List products',description:'Server pagination/search, shop membership and purchase-price masking. Stock is read-only.',querystring:listQuery,response:{200:{type:'array',items:productResponse}}})},request=>application.products(request.identity.id,request.query.shopId,request.query));
    app.get('/api/v1/products/:id',{schema:schema({summary:'Get product',description:'Tenant-scoped product DTO; no cost balance columns.',params:id,querystring:object({shopId:uuid}),response:{200:productResponse}})},request=>application.product(request.identity.id,request.query.shopId,request.params.id));
    app.post('/api/v1/products',{schema:schema({summary:'Create product',description:'Owner only. Product/unit validation and any opening balance commit atomically. requestId protects retries.',body:productInput,response:{201:productResponse}})},async(request,reply)=>{reply.code(201);return application.saveProduct(request.identity.id,request.body);});
    const update={...productInput,required:[...productInput.required,'expectedVersion'],properties:{...productInput.properties}};
    delete update.properties.openingStock;
    app.put('/api/v1/products/:id',{schema:schema({summary:'Update product / units / status',description:'Versioned owner edit; stock updates are forbidden. Backend checks whether conversions may change.',params:id,body:update,response:{200:productResponse}})},request=>application.saveProduct(request.identity.id,request.body,request.params.id));
    for(const domain of ['categories','suppliers']){
        app.get(`/api/v1/${domain}`,{schema:schema({summary:`List ${domain}`,description:'Shop-scoped pagination/search enforced by the server.',querystring:shopQuery})},request=>application[domain](request.identity.id,request.query.shopId,request.query));
        const properties={shopId:uuid,name:{type:'string',minLength:1,maxLength:domain==='categories'?80:120},
            ...(domain==='suppliers' && {phone:{type:'string',maxLength:30},address:{type:'string',maxLength:300},note:{type:'string',maxLength:500}})};
        const command=object(properties,['shopId','name']);
        const save=domain==='categories'?'saveCategory':'saveSupplier';
        app.post(`/api/v1/${domain}`,{schema:schema({summary:`Create ${domain}`,description:'Owner-only mutation; role/userId fields are not accepted.',body:command,response:{201:object({id:uuid})}})},async(request,reply)=>{reply.code(201);return {id:await application[save](request.identity.id,request.body,null)};});
        app.put(`/api/v1/${domain}/:id`,{schema:schema({summary:`Update ${domain}`,description:'Owner-only, tenant-scoped mutation.',params:id,body:command,response:{200:object({id:uuid})}})},async request=>({id:await application[save](request.identity.id,request.body,request.params.id)}));
    }
}
