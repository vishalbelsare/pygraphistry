import App from 'viz-client/components/app';
import { BehaviorSubject } from 'rxjs';

export function reloadHot(module) {

    const hotModules = new BehaviorSubject({ App });

    if (module.hot) {
        module.hot.accept([
            'viz-client/components/app.js'
        ], () => {
            hotModules.next({
                App: require('viz-client/components/app').default
            });
        })
    }

    return hotModules;
}
