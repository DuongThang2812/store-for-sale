import {buildBusinessService} from '../../shared/business-service.js';
import {createInventoryRepository} from './repository.js';
import {registerInventoryRoutes} from './controller.js';
export const buildInventoryService=options=>buildBusinessService({name:'inventory',createRepository:createInventoryRepository,registerRoutes:registerInventoryRoutes,...options});
