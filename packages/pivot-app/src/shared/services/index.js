import _ from 'underscore';
import logger from 'pivot-shared/logger';
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

import { loadAppFactory } from './loadApp';
import { userStore } from './loadUsers';
import { pivotStore } from './pivotStore';
import { insertPivot } from './insertPivot';
import { splicePivot } from './splicePivot';
import { searchPivot } from './searchPivot';
import { uploadGraph } from './uploadGraph';
import { checkConnector } from './checkConnector';
import { listTemplates, templateStore } from './loadTemplates';
import { listConnectors, connectorStore } from './loadConnectors';
import { listInvestigations, investigationStore } from './investigationStore';
import {
    createInvestigation,
    saveInvestigationsById,
    cloneInvestigationsById,
    removeInvestigationsById,
    switchActiveInvestigation
} from './manageInvestigation';

export function configureServices(convict, context) {
    const { app, pivotPath, investigationPath, investigationsByIdCache } = context;

    const loadApp = loadAppFactory(app);
    const { loadUsersById } = userStore({
        convict,
        loadApp,
        listTemplates,
        listConnectors,
        listInvestigations: listInvestigations.bind(null, investigationPath)
    });
    const { loadTemplatesById } = templateStore(loadApp);
    const { loadConnectorsById } = connectorStore(loadApp);
    const {
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById
    } = investigationStore(loadApp, investigationPath, investigationsByIdCache);

    const { loadPivotsById, unloadPivotsById, persistPivotsById, unlinkPivotsById } = pivotStore(
        loadApp,
        pivotPath,
        loadTemplatesById
    );

    return wrapServices({
        loadApp,
        loadUsersById,
        loadTemplatesById,
        loadConnectorsById,
        loadInvestigationsById,
        unloadInvestigationsById,
        persistInvestigationsById,
        unlinkInvestigationsById,
        createInvestigation,
        switchActiveInvestigation,
        cloneInvestigationsById,
        saveInvestigationsById,
        removeInvestigationsById,
        loadPivotsById,
        unloadPivotsById,
        persistPivotsById,
        unlinkPivotsById,
        insertPivot,
        splicePivot,
        searchPivot,
        checkConnector,
        uploadGraph
    });
}

export default configureServices;

export function wrapServices(services) {
    return _.mapObject(
        services,
        service => (typeof service === 'function' ? wrapService(service) : service)
    );
}

function wrapService(service) {
    return function(...args) {
        const serviceArgs = _.omit(_.omit(args[0], 'options'), v => typeof v === 'function');
        log.info(`Calling ${service.name} ${JSON.stringify(serviceArgs)}`);
        return service.apply(this, args);
    };
}
