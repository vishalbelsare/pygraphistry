import Color from 'color';

import {
    ref as $ref,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function scene(path, base) {
    return function scene({ loadViewsById, loadLabelsByIndexAndType }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const setColors = setHandler(path, loadViewsById,
            { color: true },
            ( color, path, context) => {

                color = new Color(color);
                const { view } = context;
                const { nBody, scene } = view;
                const type = path[path.length - 2];

                if (type === 'background' && scene) {
                    scene.options.clearColor = [color.rgbaArray().map((x, i) =>
                        i === 3 ? x : x / 255
                    )];
                } else if (type === 'foreground' && nBody) {
                    nBody.simulator.setColor({ rgb: {
                        r: color.red(), g: color.green(),
                        b: color.blue(), a: color.alpha()
                    }});
                    nBody.interactions.next({ play: true, layout: true });
                }

                return color;
            }
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
            set: setColors,
            route: `${base}['scene']['background', 'foreground'].color`,
            returns: `Color<hsv>`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['hints', 'server', 'options'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['controls'][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene']['controls'][{keys}][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['settings'][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            route: `${base}['scene']['settings'][{keys}][{keys}]`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['scene']['settings'][{keys}][{keys}][{keys}]`,
        }, {
            call: handleLayoutRequest,
            route: `${base}['scene'].layout`
        }];

        function handleLayoutRequest(path, [simulating = false]) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            return loadViewsById({
                workbookIds, viewIds
            })
            .map(({ workbook, view }) => {
                const { nBody, scene } = view;
                if (nBody && nBody.interactions) {
                    nBody.interactions.next({ play: true, layout: true });
                }
                return $value(`
                    workbooksById['${workbook.id}']
                        viewsById['${view.id}']
                        .scene.simulating`,
                    scene.simulating = simulating
                );
            });
        }
    }
}
