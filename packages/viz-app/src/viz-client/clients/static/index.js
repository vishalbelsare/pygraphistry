import { Model } from 'viz-client/falcor';
import { SocketIO } from 'mock-socket';
import { Observable, Scheduler } from 'rxjs';
import { services } from 'viz-client/services';
import { handleVboUpdates } from 'viz-client/streamGL/staticclient';
import { getDataSourceFactory } from 'viz-shared/middleware';

export function initialize(options, debug) {

    const socket = new SocketIO();
    const routeServices = services();
    const getDataSource = getDataSourceFactory(routeServices);

    return Observable.of({
        ...options,
        socket,
        handleVboUpdates,
        model: new Model({
            recycleJSON: true,
            scheduler: Scheduler.asap,
            treatErrorsAsValues: true,
            allowFromWhenceYouCame: true,
            source: getDataSource({
                request: { query: options }
            })
        })
    });
}
