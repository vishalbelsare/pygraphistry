import path from 'path';

process.chdir(path.resolve('www'));

import { tellParent } from './support';

import { config, logger, start } from './server';

start().do({
    complete() {
        logger.info('viz-server completed without error, restarting viz-server');
    }
}).repeat().subscribe({
    next() {
        const listenIP = config.VIZ_LISTEN_ADDRESS;
        const listenPort = config.VIZ_LISTEN_PORT;

        logger.info('Worker listening on %s:%d', listenIP, listenPort);
        tellParent('listening', { listenIP, listenPort });
    },
    error(err) {
        tellParent('error', err);
        logger.fatal(err, 'Fatal error in viz-server');
    }
});
