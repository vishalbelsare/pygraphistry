import { simpleflake } from 'simpleflakes';

export function logErrorWithCode(e) {
    const errorCode = simpleflake().toJSON();
    console.error(` (ErrorCode: ${errorCode})\n`, e && e.stack || e);
    return errorCode;
}
