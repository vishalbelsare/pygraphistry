import { Observable } from 'rxjs';

export function captureErrorStacks(e) {
    console.error(e && e.stack || e);
    return Observable.throw(e);
}
