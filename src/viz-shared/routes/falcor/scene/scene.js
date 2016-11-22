import Color from 'color';
import { Observable } from 'rxjs';

import {
    ref as $ref,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function scene(path, base) {
    return function scene({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setColors = setHandler(path, loadViewsById,
            (node, key, color, path, { view }) => Observable.defer(() => {

                node[key] = color = new Color(color);

                const { nBody, scene } = view;
                const type = path[path.length - 2];

                // todo: move this into a service call
                if (type === 'foreground' && nBody) {
                    nBody.simulator.setColor({ rgb: {
                        r: color.red(), g: color.green(),
                        b: color.blue(), a: color.alpha()
                    }});
                    nBody.interactions.next({ play: true, layout: true });
                }

                return Observable.of({ path, value: color });
            })
        );

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['scene'][{keys}]`
        }, {
            set: setValues,
            route: `${base}['scene'].simulating`
        }, {
            get: getValues,
            route: `${base}['scene'].renderer[{keys}]`,
            returns: `Number`
        }, {
            set: setValues,
            route: `${base}['scene'].renderer['showArrows']`
        }, {
            get: getValues,
            route: `${base}['scene'].renderer['edges', 'points'][{keys}]`,
            returns: `Number`
        }, {
            set: setValues,
            route: `${base}['scene'].renderer['edges', 'points']['scaling', 'opacity']`,
            returns: `Number`
        }, {
            get: getValues,
            set: setColors,
            route: `${base}['scene'].renderer['background', 'foreground'].color`,
            returns: `Color`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene'].controls[{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene'].controls[{keys}][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene'].settings[{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene'].settings[{keys}][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene'].settings[{keys}][{keys}][{keys}]`,
        }];
    }
}
