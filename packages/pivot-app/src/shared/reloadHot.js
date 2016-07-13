import { App } from './components/App';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept([
            './components/App.js'
        ], () => {
            hotModules.next({
                App: require('./components/App')
            });
        })
    }

    return hotModules;
}
