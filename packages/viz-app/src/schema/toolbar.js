import Color from 'color';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value } from '@graphistry/falcor-json-graph';

export function toolbar(path, base) {
    return function toolbar({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: 'Reference',
            get: getToolbar(base),
            route: `${base}['toolbar']`
        }, {
            get: getValues,
            set: setValues,
            returns: 'Boolean',
            route: `${base}['toolbars'][{keys}].visible`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}][{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}['toolbars'][{keys}][{keys}][{keys}]`
        }];
    }
}

function getToolbar() {
    return function(path, args) {
        function mkPath(id) {
            return path.slice(0, -1).concat(['toolbars', [id]]);
        }

        let res;

        if (isSet(this.request.query.beta)) {
            res = mkPath('beta');
        } else if (isSet(this.request.query.static)) {
            res = mkPath('static');
        } else {
            res = mkPath('stable')
        }

        return [$value(path, $ref(res))];
    }
}

function isSet(param) {
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
            default: return Boolean(param);
        }
    } else {
        return false;
    }
}
