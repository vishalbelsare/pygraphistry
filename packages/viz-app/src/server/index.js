import { VError } from 'verror';
import { Router } from 'express';
import configureWorkers from './workers';
import _config from '@graphistry/config';
import { createLogger } from '@graphistry/common/logger';
import { authenticateMiddleware } from './authentication';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { reportWorkerActivity } from './reportWorkerActivity';
import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';
import { initialize as initializeNbody } from 'viz-app/worker/simulator/kernel/KernelPreload';

setObservableConfig(rxjsObservableConfig);

if (process.env.NODE_ENV !== 'production') {
    require('./hot-server.js');
}

const config = _config();
const logger = createLogger('viz-app:server');
const isWorkerActive = new BehaviorSubject(false);
const exitOnDisconnect = !config.ALLOW_MULTIPLE_VIZ_CONNECTIONS;

logger.warn(`Precompiling layout kernels`);
initializeNbody();

reportWorkerActivity({ config, isWorkerActive })
    .do(null, setActiveStatus).publish().connect();


let serverMiddleware;
function hotServerMiddleware(req, res, next) {

    logger.trace({req, res}, 'Received Express.js request');

    if (!serverMiddleware) {
        try {
            serverMiddleware = configureWorkers(config, setActiveStatus, req.app.io);
        } catch (err) {
            setActiveStatus(err);
        }
    }

    return serverMiddleware(req, res, next);
}


function setActiveStatus(err, isActive = false) {
    if (!err && isActive) {
        logger.info({ active: true }, 'Reporting worker is active.');
        return isWorkerActive.next(true);
    }
    logger.info({ active: false }, 'Reporting worker is inactive.');
    // isWorkerActive.next(false);
    if (exitOnDisconnect) {
        logger.info('Attempting to exit worker process.');
        terminateServer(err);
    }
}


function terminateServer(err) {
    // The delay (in ms) before this function calls `process.exit()`. That function is pretty
    // 'violent' and may kill the process at that very moment, regardless of what it's currently
    // doing. By adding a delay here, we try to let any log output, HTTP responses, etc. complete,
    // before the process dies. It's a hack, but short
    const exitDelay = 5000;

    if(err) {
        // Template strings don't strip leading whitespace, hence the weird indentation here.
        let partingMessage = `
${'#'.repeat(80)}
Server process is terminating due to an error: ${err.toString()}

${VError.fullStack(err)}
${'#'.repeat(80)}
`;
        console.error(partingMessage);
        // Exit codes 1-12 are currenty already used by Node to signal an exit due to one of its
        // internal errors. See: https://nodejs.org/api/process.html#process_exit_codes
        setTimeout(() => process.exit(32), exitDelay);
    } else {
        let partingMessage = `
${'-'.repeat(80)}
Server process has completed normally, and will terminate.
${'-'.repeat(80)}
`;
        console.log(partingMessage);
        setTimeout(() => process.exit(0), exitDelay);
    }
}


const authenticate = authenticateMiddleware();


const serverRouter = Router();
serverRouter.use(authenticate, hotServerMiddleware);


export default function routeRequest(req, res, next) {
    serverRouter.handle(req, res, next);
}
