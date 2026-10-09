import { uuid,object } from '../../shared/contracts.js';
const money={anyOf:[{type:'integer',minimum:0,maximum:999999999},{type:'null'}]};
const unit=object({key:{type:'string',pattern:'^[a-z][a-z0-9_]{0,23}$'},name:{type:'string',minLength:1,maxLength:24},
    factor:{type:'integer',minimum:1,maximum:1000000000},purchasePrice:money,salePrice:money,canPurchase:{type:'boolean'},canSell:{type:'boolean'}},['key','name','factor','canPurchase','canSell']);
export const productInput=object({shopId:uuid,requestId:uuid,name:{type:'string',minLength:1,maxLength:120},category:{type:'string',minLength:1,maxLength:80},
    productGroup:{type:'string',enum:['snacks','drinks','beer','spices','seeds','tobacco','fruit','other']},baseUnit:{type:'string',minLength:1,maxLength:24},
    units:{type:'array',minItems:1,maxItems:32,items:unit},openingStock:{type:'integer',minimum:0,maximum:1000000000},
    lowStockThreshold:{type:'integer',minimum:0,maximum:1000000000},isActive:{type:'boolean'},expectedVersion:{type:'integer',minimum:1}},
    ['shopId','requestId','name','category','productGroup','baseUnit','units']);
export const productResponse=object({id:uuid,shopId:uuid,name:{type:'string'},category:{type:'string'},categoryId:uuid,productGroup:{type:'string'},
    baseUnit:{type:'string'},stockBase:{type:'integer'},lowStockThreshold:{type:'integer'},isActive:{type:'boolean'},version:{type:'integer'},
    createdAt:{type:'string'},updatedAt:{type:'string'},units:{type:'array',items:{...unit,properties:{...unit.properties,id:uuid}}}});
