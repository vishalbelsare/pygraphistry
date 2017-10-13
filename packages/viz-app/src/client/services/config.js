import { Observable } from 'rxjs';

export function loadConfig() {
    return Observable.of({
        RELEASE: __RELEASE__
    });
}
