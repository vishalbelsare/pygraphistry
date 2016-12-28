import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createLogger('viz-app:server-errors');

import { Observable } from 'rxjs';


export function captureErrorStacks(err, msg = 'Falcour route error') {
    // console.error(e && e.stack || e);
    logger.error({err}, msg);

    return Observable.throw(err);
}
