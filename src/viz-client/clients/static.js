import { Model } from '../falcor';
import { SocketIO } from 'mock-socket';
import { Observable, Scheduler } from 'rxjs';
import { handleVboUpdates } from '../streamGL/staticclient';
import { getDataSourceFactory } from '../../viz-shared/middleware';
import { loadConfig, loadViews, loadLabels, loadWorkbooks } from '../services';

export function initialize(options, debug) {

    const workbooksById = {};
    const loadViewsById = loadViews(workbooksById);
    const loadWorkbooksById = loadWorkbooks(workbooksById);
    const loadLabelsByIndexAndType = loadLabels(workbooksById);

    const routeServices = {
        loadConfig,
        loadViewsById,
        loadWorkbooksById,
        loadLabelsByIndexAndType
    };

    const socket = new SocketIO();
    const getDataSource = getDataSourceFactory(routeServices);

    return Observable.of({
        ...options, handleVboUpdates, socket, model: new Model({
            scheduler: scheduler.asap,
            source: getDataSource({
                request: { query: options }
            })
        })
    });
}
