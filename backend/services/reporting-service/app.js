import {buildBusinessService} from '../../shared/business-service.js';
import {createReportingRepository} from './repository.js';
import {registerReportingRoutes} from './controller.js';
export const buildReportingService=options=>buildBusinessService({name:'reporting',createRepository:createReportingRepository,registerRoutes:registerReportingRoutes,...options});
