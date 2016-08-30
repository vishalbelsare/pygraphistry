import { Observable } from 'rxjs';

export function loadApp(app) {
    return function loadApp() {
        return Observable.of(app);
    }
}
