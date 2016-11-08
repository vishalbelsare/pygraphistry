import { simpleflake } from 'simpleflakes';

export function logErrorWithCode(log, e) {
    const errorCode = simpleflake().toJSON();
    log.error({err: e, errorCode: errorCode});
    return errorCode;
}
