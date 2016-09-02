import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from 'reaxtor-falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function filters(path, base) {
    return function filters({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);
        const getFilters = getHandler(path.concat('filter'), loadFiltersById);

        return [{
            returns: `*`,
            get: getValues,
            route: `${base}['filters'][{keys}]`,
        }, {
            get: getValues,
            route: `${base}['filters'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['filters'].controls[{keys}][{keys}]`
        }, {
            call: addFilter,
            route: `${base}['filters'].add`
        }, {
            call: removeFilter,
            route: `${base}['filters'].remove`
        }];

        function addFilter(path, args) {
            const workbookIds = [].concat(path[1]);
            const viewIds = [].concat(path[3]);
            return loadViewsById({
                workbookIds, viewIds
            })
            .mergeMap(({ workbook, view }) => {
                const { filters, exclusions } = view;
            });
        }

        function removeFilter(path, args) {

        }

        function loadFiltersById({
            workbookIds, viewIds, filterIds, options
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

                    values.push($value(`
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
