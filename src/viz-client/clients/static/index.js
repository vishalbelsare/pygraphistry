import { Model } from 'reaxtor';
import { SocketIO } from 'mock-socket';
import { Observable, Scheduler } from '@graphistry/rxjs';
import { getDataSourceFactory } from '../../../viz-shared/middleware';
import { loadConfig, loadViews, loadLabels, loadWorkbooks } from './services';

export function initialize(options, debug) {

    const workbooksById = {};
    const loadViewsById = loadViews(workbooksById);
    const loadWorkbooksById = loadWorkbooks(workbooksById);
    const loadLabelsByIndexAndType = loadLabels(workbooksById);

    const props = {};
    const services = {
        loadConfig,
        loadViewsById,
        loadWorkbooksById,
        loadLabelsByIndexAndType
    };

    const getDataSource = getDataSourceFactory(services, props);
    const socket = SocketIO(`/socket.io`, {
        reconnection: false, query: {
            ...options, falcorClient: true
        }
    });

    return Observable.of({
        ...options, socket, model: new Model({
            scheduler: scheduler.asap,
            source: getDataSource({
                request: { query: options }
            })
        })
    });
}
