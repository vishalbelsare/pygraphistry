import { resolve } from 'path';
import { appendFile } from 'fs';
import { logger as log } from '@graphistry/common';

const clientErrorLogfilePath = resolve('/var/log/clients/clients.log');

export function logClientError(req, res, logger, isLocal = false) {
    try {
        var msg = req.body;

        if (msg.err && msg.err.stack) {
            msg.err.stackArray = log.getFullErrorStack(msg.err.stack);
        }

        if (isLocal) {
            if (msg.level > 30) {
                msg.ip = req.ip;
                logger.error(msg, 'Client Error');
            }
        } else {
            // FIXME: we should be using a write stream, not `fs.appendFile`, for efficiency
            appendFile(clientErrorLogfilePath, JSON.stringify(msg) + '\n', err => {
                err && logger.error({ err, req, res }, 'Error writing client error');
            });
        }

        // Immediately send a "OK" response, since the client shouldn't care if our logger fails
        res.status(200).end();
    } catch (err) {
        logger.error({ err, req, res }, 'Error reading client error');
        res.status(500).end();
    }
}
