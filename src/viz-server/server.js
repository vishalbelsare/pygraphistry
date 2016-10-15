import path from 'path';
import express from 'express';
import compression from 'compression';
import bodyParser from 'body-parser';
import RxRouter from 'rx-router';
import SocketIOServer from 'socket.io';
import RxHTTPServer from 'rx-http-server';
import _config from '@graphistry/config';
import { BehaviorSubject, Observable } from 'rxjs';

import { requisitionWorker } from './requisitionWorker';
import { reportWorkerActivity } from './reportWorkerActivity';
import { logger as commonLogger } from '@graphistry/common';

import corsMiddleware from 'cors';
import cookieParser from 'cookie-parser';
import { nocache, allowCrossOrigin } from './middleware';

export const config = _config();
export const logger = commonLogger.createLogger('viz-server:server');

export function start() {
    const app = express();
    const appRoute = Observable.bindCallback(app);
    const appHandler = ({ request, response }) => appRoute(request, response);

    const server = new RxHTTPServer();
    const routes = RxRouter(appHandler, {});
    const socketServer = new SocketIOServer(server, { serveClient: false });
    const serverListen = Observable.bindNodeCallback(server.listen.bind(server), function () {
        console.log('************************************************************');
        console.log('Express app listening at http://%s:%s', this.address().address, this.address().port);
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('process.pid:', process.pid);
        console.log('__dirname:', __dirname);
        console.log('root:', path.resolve());
        console.log('************************************************************');
        return server;
    });

    app.use(nocache);
    app.use(compression());
    app.use(cookieParser());
    app.use(allowCrossOrigin);
    app.use(`/graph`, bodyParser.urlencoded({ extended: false }));

    if (config.ENVIRONMENT === 'local') {
        app.use(corsMiddleware({ origin: '*' }));
    }
    // Tell Express to trust reverse-proxy connections from localhost, linklocal, and private IP ranges.
    // This allows Express to expose the client's real IP and protocol, not the proxy's.
    app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

    return serverListen(
            config.VIZ_LISTEN_PORT,
            config.VIZ_LISTEN_ADDRESS
        )
        .mergeMap((listeningServer) => {
            return requisitionWorker({ config, logger, app, server: listeningServer, socketServer })
                .multicast(
                    () => new BehaviorSubject({ isActive: false }),
                    (worker) => Observable.merge(
                        worker.filter(isRequestEvent),
                        worker.filter(isActiveEvent)
                            .pluck('isActive')
                            .let((isWorkerActive) => reportWorkerActivity({
                                config, isWorkerActive
                            }))
                            .ignoreElements()
                    )
                );
        })
        .mergeMap(routes)
        .ignoreElements()
        .concat(Observable.never())
        .catch((e) => {
            if (!e || !e.hasOwnProperty('shouldExit')) {
                return Observable.throw(e);
            }
            const { error, message, exitCode, shouldExit } = e;
            if (error || message) {
                logger.error(error, message);
            }
            if (shouldExit) {
                process.exit(exitCode);
            }
            return Observable.empty();
        });
}

function isActiveEvent({ isActive }) {
    return isActive !== undefined;
}

function isRequestEvent({ request, response }) {
    return request !== undefined && response !== undefined;
}
