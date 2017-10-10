import { logger as log } from '@graphistry/common';
const logger = log.createLogger('server', 'src/server/support/tagSession.js');

import crypto from 'crypto';
import url from 'url';
import { simpleflake } from 'simpleflakes';

//clientId is either client-defined or generated
// ?{clientId} -> uuid
function getClientId(query) {
  return query.clientId || simpleflake().toJSON();
}

//Associate a clientId with all logs and express session
//  (viz-app assumes express, log is used by only 1 user)
export function maybeTagServer(request) {
  let clientId = request.app.get('clientId');

  if (clientId === undefined) {
    const query = url.parse(request.url, true).query || {};
    clientId = getClientId(query);

    request.app.set('clientId', clientId);
    log.addUserInfo({ cid: clientId });

    if (query.usertag && query.usertag !== 'undefined') {
      log.addUserInfo({ tag: query.usertag });
    }

    logger.debug({ req: request }, `Client has connected with clientId: ${clientId}`);
  }

  return clientId;
}
