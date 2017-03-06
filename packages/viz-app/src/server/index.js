import { VError } from 'verror';
import configureWorkers from './workers';
import { BehaviorSubject } from 'rxjs/BehaviorSubject';
import { createLogger } from '@graphistry/common/logger';
import { reportWorkerActivity } from './reportWorkerActivity';
import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';
import { initialize as initializeNbody } from 'viz-app/worker/simulator/kernel/KernelPreload';

setObservableConfig(rxjsObservableConfig);

const logger = createLogger('viz-app:server');

function server(webpackStats = {}) {

    logger.info(`Precompiling layout kernels`);

    initializeNbody();

    let serverMiddleware, workerActivity, activeCB;
    const isWorkerActive = new BehaviorSubject(false);

    return function hotServerMiddleware(req, res, next) {

        logger.trace({req, res}, 'Received Express.js request');

        if (!serverMiddleware) {
            const { io, config } = req;
            const exitOnDisconnect = !config.ALLOW_MULTIPLE_VIZ_CONNECTIONS;
            activeCB = function setActiveStatus(err, isActive = false) {
                if (!err && isActive) {
                    return isWorkerActive.next(true);
                }
                isWorkerActive.next(false);
                if (exitOnDisconnect) {
                    terminateServer(err);
                }
            };

            try {

                workerActivity = reportWorkerActivity({
                    config: req.config, isWorkerActive
                }).do(null, activeCB).publish().connect();

                serverMiddleware = configureWorkers(config, activeCB, io);
            } catch (err) {
                activeCB(err);
            }
        }

        return serverMiddleware(req, res, next);
    }
}

export { server };
export default server;

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
        setTimeout(() => process.exit(0), exitDelay)
    }
}
