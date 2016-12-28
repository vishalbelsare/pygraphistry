import App from 'viz-worker/components/app';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept([
            'viz-worker/components/app.js'
        ], () => {
            hotModules.next({
                App: require('viz-worker/components/app').default
            });
        })
    }

    return hotModules;
}
