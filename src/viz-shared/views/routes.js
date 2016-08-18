import {
    ref as $ref,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../routes';

export function views(path, route) {
    return function views({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);

        return [{
            get: getValues,
            route: `${route}[{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${route}[
                'sets', 'timebar',
                'inspector', 'exclusions', 'histograms'
            ].length`,
            returns: `Number`
        }, {
            get: getValues,
            route: `${route}[
                'setsById',
                'sets', 'legend', 'timebar',
                'background', 'foreground',
                'inspector', 'exclusions', 'histograms',
                'exclusionsById', 'histogramsById'
            ][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            route: `${route}[
                'setsById',
                'legend', 'inspector', 'histograms',
                'exclusionsById', 'histogramsById'
            ][{keys}][{keys}]`,
            returns: `*`
        }, {
            get: getValues,
            set: setViewColorsHandler,
            route: `${route}['background', 'foreground'].color`,
            returns: `Color<hsv>`
        }];

        function setViewColorsHandler(json) {

            const { viewIds, workbookIds } = getIDsFromJSON(json);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {

                const values = [];
                const { nBody, scene } = view;
                const viewJSON = json
                    .workbooksById[workbook.id]
                    .viewsById[view.id];

                for (const colorType in viewJSON) {

                    const color = view[colorType].color =
                        new Color(viewJSON[colorType].color);

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            ['${colorType}'].color`,
                        color.hsv()
                    ));

                    if (colorType === 'background') {
                        scene.options.clearColor = [color.rgbaArray().map((x, i) =>
                            i === 3 ? x : x / 255
                        )];
                    } else if (nBody) {
                        nBody.simulator.setColor({ rgb: {
                            r: color.red(), g: color.green(),
                            b: color.blue(), a: color.alpha()
                        }});
                        nBody.interactions.next({ play: true, layout: true });
                    }
                }

                return values;
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}
