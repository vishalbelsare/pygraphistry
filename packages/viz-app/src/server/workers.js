import { Router } from 'express';
import { VError, WError } from 'verror';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:workerRouter');
import { authenticateMiddleware } from './authentication';
import { HealthChecker } from './HealthChecker';


import configureEtlWorker from './etl';
import configureVizWorker from './viz';



const healthcheck = HealthChecker();

function configureWorkers(config, convict, activeCB) {

    let workerName, workerRouter, workerRouterStartTime, appRouter = Router();
    const allowMultipleVizConnections = !!config.ALLOW_MULTIPLE_VIZ_CONNECTIONS;

    try {
        var authenticate = authenticateMiddleware(convict);
    } catch(authMiddlewareError) {
        logger.fatal(authMiddlewareError, 'An error occured loading the Express.js authentication middleware. Because this could compromise security, server will now terminate.');
        activeCB(authMiddlewareError);
    }


    function healthcheckHandler(req, res, next) {
        const health = healthcheck();
        logger.info({health, req, res}, 'healthcheck');
        res.status(health.clear.success ? 200 : 500).json(
            {...health.clear, 
                claimed: !!workerRouter, 
                durationMS: workerRouterStartTime ? Date.now() - workerRouterStartTime : undefined });
    }

    appRouter.use('/healthcheck', authenticate, healthcheckHandler);
    appRouter.use('/etl/healthcheck', authenticate, healthcheckHandler);
    appRouter.use('/graph/healthcheck', authenticate, healthcheckHandler);
    appRouter.use('/etl', selectWorkerRouter('etl', configureEtlWorker, false), requestErrorHandler);
    appRouter.use('/graph/graph.html', authenticate, selectWorkerRouter('viz', configureVizWorker, true), requestErrorHandler);
    appRouter.use((req, res, next) => {
        if (!workerRouter) {
            logger.warn(`Error trying to find the current worker router in 'workerStatus'. Ignoring request, and telling Express let the next maching middleware/route handle it.`);
            return next();
        }
        workerRouter(req, res, next);
    }, requestErrorHandler);

    return appRouter;

    function selectWorkerRouter(configureName, configureWorker, requireAuthentication = true) {
        return function innerSelectWorkerRouter(req, res, next) {

            if (workerRouter) {
                if (!allowMultipleVizConnections) {
                    const inUseError = new WError(
                        {info: { httpStatus: 409 }},
                        'This viz-app worker is already in use by another client'
                    );
                    logger.warn({req, res, err: inUseError, 
                        workerRouterStartTime, workerRouterLongevityMS: Date.now() - workerRouterStartTime}, 
                        "A client tried to connect to this worker, but it's currently in use with an existing client. Will reject the request with an error response.");
                    // Pass the error to Express, so an error handling middleware can take care
                    // of notifying the client.
                    return next(inUseError);
                }
            }

            if (workerName !== configureName) {
                workerName = configureName;

                if(requireAuthentication) {
                    const authenticatedRouter = Router();
                    authenticatedRouter.use(authenticate);
                    authenticatedRouter.use(configureWorker(config, activeCB, req.app.io));

                    workerRouter = authenticatedRouter;
                } else {
                    workerRouter = configureWorker(config, activeCB, req.app.io);
                }
                workerRouterStartTime = Date.now();
            }

            // Tell Express to continue processing this request, and pass it to the
            // next matching middleware/route. This allows the reequest to
            // eventually fall through to the new workerAppRouter we just created,
            // and be passed into the new worker module to handle.
            next();
        }
    }
}

export { configureWorkers };
export default configureWorkers;


// eslint-disable-next-line no-unused-vars
function requestErrorHandler(err, req, res, next) {
    logger.warn({req, res, err}, 'An error occured while processing the HTTP request. Responding to the request with an error code and message, if possibly.');

    if(res.headersSent) {
        logger.info({req, res}, 'requestErrorHandler not sending error to client, because headers (and likely data) has already been sent to the client. The error will only be logged server-side, and the request will be ended in its current state.');
        res.end();
        return;
    }

    var { httpStatus = 500 } = VError.info(err);
    // Whether the client prefers JSON over text/HTML, given any `Accepts` headers in the request
    var wantsJsonResponse = req.accepts(['text/html', 'text/*', 'application/json']) === 'application/json';

    if(wantsJsonResponse || req.is('json')) {
        res.status(httpStatus).send({ success: false, msg: err.message });
    } else {
        res.status(httpStatus).send(err.message);
    }
}
