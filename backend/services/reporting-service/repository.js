export function createReportingRepository(db){return{
    dashboard:(actor,shopId)=>db.call(actor,{name:'reporting_api.dashboard',types:['uuid']},[shopId]),
    revenue:(actor,input)=>db.call(actor,{name:'reporting_api.revenue',types:['uuid','integer']},[input.shopId,input.days||7]),
};}
