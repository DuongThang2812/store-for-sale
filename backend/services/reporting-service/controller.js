import {documented,object,uuid} from '../../shared/contracts.js';
export function registerReportingRoutes(app,repository){
    const schema=options=>documented({tags:['Reporting'],...options});
    app.get('/api/v1/reports/dashboard',{schema:schema({summary:'Owner dashboard',description:'Single DB snapshot; revenue/cash/debt/COGS/profit/stock/spoilage. Owner only; unknown costs remain null.',querystring:object({shopId:uuid})})},r=>repository.dashboard(r.identity.id,r.query.shopId));
    app.get('/api/v1/reports/revenue',{schema:schema({summary:'Revenue / cash / gross profit',description:'Server aggregates Vietnam shop-day boundaries for 1/7/30/90 days. Collection is not new sales revenue.',querystring:object({shopId:uuid,days:{type:'integer',enum:[1,7,30,90],default:7}},['shopId'])})},r=>repository.revenue(r.identity.id,r.query));
}
