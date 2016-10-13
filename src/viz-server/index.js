import path from 'path';

process.chdir(path.resolve('www'));

import { tellParent } from './support';

import { config, logger, start } from './server';

start().subscribe({
    next() {
        const listenIP = config.VIZ_LISTEN_ADDRESS;
        const listenPort = config.VIZ_LISTEN_PORT;

        logger.info('Worker listening on %s:%d', listenIP, listenPort);
        tellParent('listening', { listenIP, listenPort });
    },
    error(err) {
        logger.error(err, 'Could not start viz server');
        tellParent('error', err);
    }
});
