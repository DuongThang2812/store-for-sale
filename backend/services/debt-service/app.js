import {buildBusinessService} from '../../shared/business-service.js';
import {createDebtRepository} from './repository.js';
import {registerDebtRoutes} from './controller.js';
export const buildDebtService=options=>buildBusinessService({name:'debt',createRepository:createDebtRepository,registerRoutes:registerDebtRoutes,...options});
