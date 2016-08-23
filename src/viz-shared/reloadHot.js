import { App } from './containers/app';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept([
            './containers/app/index.js'
        ], () => {
            hotModules.next({ ...require('./containers/app') });
        })
    }

    return hotModules;
}
