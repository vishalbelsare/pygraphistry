import {
    ref as $ref,
    pathValue as $pathValue
} from 'falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function views({ loadViewsById }, props) {

    const genericGetHandler = getHandler(['workbook', 'view'], loadViewsById, props);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    [{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}][
                        'legend', 'background', 'foreground',
                        'sets', 'panels', 'filters', 'settings',
                        'setsById', 'filtersById', 'settingsById'
                    ][{keys}]`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}][
                        'legend', 'setsById',
                        'filtersById', 'settingsById'
                    ][{keys}][{keys}]`
    }, {
        set: setViewColorsHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    ['background', 'foreground']
                    .color`
    }];

    function setViewColorsHandler(json) {

        const { viewIds, workbookIds } = getIDsFromJSON(json);
        const { request: { query: options = {}}} = this;

        return loadViewsById({
            workbookIds, viewIds, options
        })
        .mergeMap(({ workbook, view }) => {

            const values = [];
            const { graph, scene } = view;
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
                } else if (graph) {
                    graph.simulator.setColor({ rgb: {
                        r: color.red(), g: color.green(),
                        b: color.blue(), a: color.alpha()
                    }});
                    graph.interactions.next({ play: true, layout: true });
                }
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    }
}
