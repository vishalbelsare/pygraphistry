import {
    ref as $ref,
    atom as $atom,
    pathValue as $pathValue
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../routes';

export function filters(path, route) {
    return function filters({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const getFilterValues = getHandler(path.concat('filter'), loadFiltersById);

        return [{
            get: getValues,
            route: `${route}.filters.length`,
            returns: `Number`
        }, {
            get: getValues,
            route: `${route}.filters['name', 'open']`,
            returns: `String`
        }, {
            get: getValues,
            route: `${route}.filters[{integers}]`,
            returns: `$ref('workbooksById[{workbookId}].viewsById[{viewId}][{listId}]')`
        }, {
            get: getFilterValues,
            route: `${route}.filtersById[{keys}][{keys}]`,
            returns: `*`
        }];

        function loadFiltersById({
            workbookIds, viewIds, filterIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => filterIds,
                ({ workbook, view }, filterId) => ({
                    workbook, view, filter: view.filtersById[filterId]
                })
            );
        }

/*
        function loadControls({
            workbookIds, viewIds, settingIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => settingIds,
                ({ workbook, view }, settingId) => ({ workbook, view, settingId })
            )
            .mergeMap(
                ({ workbook, view, settingId }) => controlIds,
                ({ workbook, view, settingId }, controlId) => ({ workbook, view, settingId, controlId })
            );
        }

        function setControlHandler(json) {

            const { request: { query: options = {}}} = this;
            const { workbookIds, viewIds, settingIds, controlIds } = getIDsFromJSON(json);

            return loadControls({
                workbookIds, viewIds, settingIds, controlIds, options
            })
            .mergeMap(({ workbook, view, settingId, controlId }) => {

                const values = [];
                const controlJSON = json
                    .workbooksById[workbook.id]
                    .viewsById[view.id]
                    .settingsById[settingId][controlId];

                const isSetingParam = 'value' in controlJSON;

                if (isSetingParam) {

                    const control = view
                        .settingsById[settingId][controlId];

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .settingsById['${settingId}'][
                                '${controlId}'
                            ].value`,
                        $atom(control.value = controlJSON.value)
                    ));

                    const isLayoutParam = (
                        'props' in control) && (
                        'algoName' in control.props);

                    const { nBody } = view;

                    if (isLayoutParam && nBody && nBody.interactions) {
                        const { algoName } = control.props;
                        nBody.interactions.next({
                            play: true, layout: true, simControls: {
                                [algoName]: {
                                    [controlId]: control.value
                                }
                            }
                        });
                    }
                }

                return values;
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
*/
    }
}
