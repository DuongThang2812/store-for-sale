import {buildBusinessService} from '../../shared/business-service.js';
import {createSalesRepository} from './repository.js';
import {registerSalesRoutes} from './controller.js';
export const buildSalesService=options=>buildBusinessService({name:'sales',createRepository:createSalesRepository,registerRoutes:registerSalesRoutes,...options});
