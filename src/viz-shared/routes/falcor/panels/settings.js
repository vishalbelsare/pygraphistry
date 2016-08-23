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

export function settings(path, route) {
    return function settings({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);
        const getSettingValues = getHandler(path.concat('setting'), loadSettingsById);

        return [{
            get: getValues,
            route: `${route}.settings.length`,
            returns: `Number`
        }, {
            get: getValues,
            route: `${route}.settings['name', 'open']`,
            returns: `String`
        }, {
            get: getValues,
            route: `${route}.settings[{integers}]`,
            returns: `$ref('workbooksById[{workbookId}].viewsById[{viewId}][{listId}]')`
        }, {
            get: getSettingValues,
            route: `${route}.settingsById[{keys}]['id', 'name', 'length']`,
            returns: `*`
        }, {
            get: getSettingValues,
            set: setControlHandler,
            route: `${route}.settingsById[{keys}][{integers}][{keys}]`
        }];

        function loadSettingsById({
            workbookIds, viewIds, settingIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => settingIds,
                ({ workbook, view }, settingId) => ({
                    workbook, view, setting: view.settingsById[settingId]
                })
            );
        }

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
    }
}
