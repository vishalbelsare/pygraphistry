import { App } from './main';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {
    // eslint-disable-line no-shadow

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept(['./containers/App.js'], () => {
            hotModules.next({
                App: require('./main').App
            });
        });
    }

    return hotModules;
}
