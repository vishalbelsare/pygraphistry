import _ from 'underscore';
import logger from '../logger.js';
const log = logger.createLogger('pivot-app', __filename);

export * from './loadApp';
export * from './loadUsers';
export * from './loadTemplates';
export * from './loadInvestigations';
export * from './manageInvestigation';
export * from './insertPivot';
export * from './loadPivots';
export * from './loadConnectors';
export * from './splicePivot';
export * from './checkConnector';
export * from './searchPivot';
export * from './uploadGraph';


export function wrapServices(services) {
    return _.mapObject(services, service =>
        (typeof service === 'function') ? wrapService(service) : service
    );
}

function wrapService(service) {
    return function (...args) {
        log.info(`Calling ${service.name}`);
        return service.apply(this, args);
    };
}
