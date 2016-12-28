import { logger as log } from '@graphistry/common';
const logger = log.createLogger('viz-server', 'src/viz-server/support/tagUser.js');

import crypto from 'crypto';
import url from 'url';
import { simpleflake } from 'simpleflakes';

// Grab user info from request and add to logger
export function tagUser(request) {
    const query = url.parse(request.url, true).query || {};

    const clientId = query.clientId || simpleflake().toJSON();
    log.addUserInfo({ cid: clientId });

    if (query.usertag && query.usertag !== 'undefined') {
        log.addUserInfo({ tag: query.usertag });
    }

    logger.debug({req: request}, `Client has connected with clientId: ${clientId}`);

    return clientId;
}
