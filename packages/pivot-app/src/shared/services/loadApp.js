import { Observable } from 'rxjs';

export function loadAppFactory(app) {
  return function loadApp() {
    return Observable.of(app);
  };
}
