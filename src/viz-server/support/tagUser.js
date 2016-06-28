import crypto from 'crypto';
import { logger } from '@graphistry/common';

// Grab user info from socket and add to logger
export function tagUser(query) {
    // Generate unique connection id
    logger.addUserInfo({
        cid: crypto.randomBytes(8).toString('hex')
    });

    if (query.usertag && query.usertag !== 'undefined') {
        logger.addUserInfo({ tag: decodeURIComponent(query.usertag) });
    }
}
