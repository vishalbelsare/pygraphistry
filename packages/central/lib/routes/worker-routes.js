import url from 'url';
import util from 'util';

import 'rxjs/add/observable/bindCallback';
import { Observable } from 'rxjs/Observable';

import { pickWorker } from '../worker-router';
import { ensureValidUrl } from '../support/ensureValidUrl';

import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

export function workerRoutes() {
    return [{
        route: `graph.workers['first-available'].url`,
        get(pathSet) {
            const { config, logger, request } = this;
            return pickWorker()
                .map((worker) => {
                    logger.debug('Assigning client a worker', request.ip, worker);

                    // Get the request URL so that we can construct a worker URL from it
                    var baseUrl = ensureValidUrl(url.parse(request.originalUrl), { host: request.get('Host') });
                    var workerPort = (config.PINGER_ENABLED) ? baseUrl.port : worker.port;
                    var workerPath = (config.PINGER_ENABLED) ?
                        util.format('%sworker/%s/', config.BASE_PATH, encodeURIComponent(worker.port)) :
                        util.format('%s', config.BASE_PATH);

                    var workerUrl = ensureValidUrl({
                        query: {},
                        port: workerPort,
                        pathname: workerPath,
                        hostname: baseUrl.hostname
                    });

                    return $pathValue(pathSet, $atom(workerUrl));
                })
                .catch(({ error }) => {
                    logger.error(error, 'Error while assigning visualization worker');
                    return Observable.of($pathValue(pathSet, $error(
                        error.message || 'Error while assigning visualization worker.'
                    )));
                });
        }
    }];
}
