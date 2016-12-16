import _ from 'underscore';
import logger from '../logger.js';
const log = logger.createLogger(__filename);

export * from './loadApp';
export * from './loadUsers';
export * from './loadTemplates';
export * from './investigationStore';
export * from './manageInvestigation';
export * from './insertPivot';
export * from './pivotStore';
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
        const serviceArgs = _.omit(
            _.omit(args[0], 'options'),
            (v, k) => typeof v === 'function'
        )
        log.info(`Calling ${service.name}   ( ${JSON.stringify(serviceArgs)} )`);
        return service.apply(this, args);
    };
}
