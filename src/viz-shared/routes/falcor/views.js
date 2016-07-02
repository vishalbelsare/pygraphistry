import {
    ref as $ref,
    pathValue as $pathValue
} from 'falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function views({ loadViewsById }) {

    const genericGetHandler = getHandler(['workbook', 'view'], loadViewsById);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    [{keys}]`,
        returns: `*`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}][
                        'sets', 'panels', 'filters', 'settings'
                    ][{integers}]`,
        returns: `$ref('workbooksById[{workbookId}].viewsById[{viewId}][{listId}]')`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}][
                        'legend', 'background', 'foreground',
                        'setsById', 'filtersById', 'settingsById'
                    ][{keys}]`,
        returns: `*`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}][
                        'legend', 'setsById',
                        'filtersById', 'settingsById'
                    ][{keys}][{keys}]`,
        returns: `*`
    }, {
        get: genericGetHandler,
        set: setViewColorsHandler,
        route: `workbooksById[{keys}]
                    .viewsById[{keys}]
                    ['background', 'foreground']
                    .color`,
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
