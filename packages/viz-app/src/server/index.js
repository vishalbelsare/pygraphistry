import path from 'path';
import SocketIOServer from 'socket.io';
import configureExpress from './express';
import { createLogger } from '@graphistry/common/logger';
import setObservableConfig from 'recompose/setObservableConfig';
import rxjsObservableConfig from 'recompose/rxjsObservableConfig';
import { initialize as initializeNbody } from 'viz-app/worker/simulator/kernel/KernelPreload';

setObservableConfig(rxjsObservableConfig);

const logger = createLogger('viz-app:server');

function server(stats = {}) {

    logger.info(`Precompiling layout kernels`);

    initializeNbody();

    let serverMiddleware;
    return (req, res, next) => {
        return (serverMiddleware || (serverMiddleware =
            configureExpress(req.io, req.config)
        ))(req, res, next);
    }
}

export { server };
export default server;

