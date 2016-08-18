import { App } from './app';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept([
            './app/index.js'
        ], () => {
            hotModules.next({
                App: require('./app').App
            });
        })
    }

    return hotModules;
}
