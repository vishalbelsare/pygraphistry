import _ from 'underscore';
import { simpleflake } from 'simpleflakes';

export function logErrorWithCode(log, e) {
    const errorCode = simpleflake().toJSON();
    const { err: exception = e } = e;

    log.error({
        err: exception,
        errorCode: errorCode,
        ..._.omit(e, 'err')
    });

    return errorCode;
}
