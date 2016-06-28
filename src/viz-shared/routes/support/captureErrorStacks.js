import { Observable } from '@graphistry/rxjs';

export function captureErrorStacks(e) {
    console.error(e && e.stack || e);
    return Observable.throw(e);
}
