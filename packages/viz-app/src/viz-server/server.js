import path from 'path';
import express from 'express';
import compression from 'compression';
import bodyParser from 'body-parser';
import SocketIOServer from 'socket.io';
import RxHTTPServer from 'rx-http-server';
import _config from '@graphistry/config';
import { BehaviorSubject, Observable } from 'rxjs';
import VError from 'verror';

import { requisitionWorker } from './requisitionWorker';
import { reportWorkerActivity } from './reportWorkerActivity';
import { logger as commonLogger } from '@graphistry/common';

import corsMiddleware from 'cors';
import cookieParser from 'cookie-parser';
import { nocache, allowCrossOrigin } from './middleware';

export const config = _config();
export const logger = commonLogger.createLogger('viz-server:server');

import { HealthChecker } from './HealthChecker.js';
const healthcheck = HealthChecker();


import { initialize as initializeNbody } from 'viz-worker/simulator/kernel/KernelPreload';

export function start() {

    const app = express();
    const appRoute = Observable.bindCallback(app);
    const appRouteHandler = ({ request, response }) => appRoute(request, response);

    app.get('/vizapp/healthcheck', function(req, res) {
        const health = healthcheck();
        logger.info({...health, req, res}, 'healthcheck');
        res.status(health.clear.success ? 200 : 500).json({...health.clear});
    });

    const server = new RxHTTPServer();
    const socketServer = new SocketIOServer(server, { serveClient: false });
    const serverListen = Observable.bindNodeCallback(server.listen.bind(server), function () {
        console.log('***********************************************************');
        console.log('Express app listening at http://%s:%s', this.address().address, this.address().port);
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('process.pid:', process.pid);
        console.log('__dirname:', __dirname);
        console.log('root:', path.resolve());
        console.log('***********************************************************');
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


    initializeNbody();


    return Observable.defer(() => serverListen(
            config.VIZ_LISTEN_PORT,
            config.VIZ_LISTEN_ADDRESS
        ))
        .mergeMap((httpServer) => requisitionWorker({
            config, logger, app, server: httpServer, socketServer
        }))
        .multicast(
            () => new BehaviorSubject({ isActive: false }),
            (workerRequestsAndEvents) => Observable.merge(

                workerRequestsAndEvents
                    .filter(isRequestEvent)
                    .mergeMap(appRouteHandler),

                workerRequestsAndEvents
                    .filter(isActiveEvent)
                    .pluck('isActive')
                    .let((isWorkerActive) => reportWorkerActivity({
                        config, isWorkerActive
                    }))
            )
        )
        .ignoreElements()
        .concat(Observable.never())
        .catch((e) => {
            if (!e || !e.hasOwnProperty('shouldExit')) {
                return Observable.throw(e);
            }
            const { error, message, exitCode, shouldExit } = e;
            if (error || message) {
                const err = new VError(error || message, `viz-server exit reason: ${message}`);
                logger.error({ err });
            }
            if (shouldExit) {
                logger.info('Exiting viz-server process.');
                // Allow pending log messages to finish before exiting
                setTimeout(() => {
                    process.exit(exitCode);
                }, 1000);
                return Observable.never();
            } else {
                return Observable.empty();
            }
        });
}

function isActiveEvent({ isActive }) {
    return isActive !== undefined;
}

function isRequestEvent({ request, response }) {
    return request !== undefined && response !== undefined;
}
