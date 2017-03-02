import { Observable } from 'rxjs/Observable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readToolbarHandler = {
        get: get(loadViewsById)
    };
    const readWriteToolbarHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById)
    };

    return QL`{
        visible: ${
            readWriteToolbarHandler
        },
        ['id', 'length']: ${
            readToolbarHandler
        },
        [{ integers }]: {
            ['length', { integers }]: ${
                readToolbarHandler
            }
        }
    }`;
});

export function getToolbarRefRoute(services) {

    return function toolbarRefGetHandler(path) {
        return $value(path, $ref(path.slice(0, -1).concat(
            'toolbarsById',  isTruthy(this.options.beta) ?
                    'beta' : isTruthy(this.options.static) ?
                  'static' :
                  'stable'
        )));
    }

    function isTruthy(param) {
        if (typeof param === 'string') {
            switch(param.toLowerCase().trim()) {
                case "true":
                case "yes":
                case "1":
                    return true;
                case "false":
                case "no":
                case "0":
                    return false;
            }
            return Boolean(param);
        }
        return false;
    }
}
