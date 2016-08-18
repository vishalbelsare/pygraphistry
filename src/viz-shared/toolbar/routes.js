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

export function toolbar(path, route) {
    return function toolbar({ loadViewsById }) {
        const getValues = getHandler(path, loadViewsById);
        return [{
            get: getValues,
            route: `${route}.toolbar[{keys}]`,
            returns: `*`
        }, {
            returns: `*`,
            get: getValues,
            route: `${route}['toolbarItems', 'toolsById'][{keys}][{keys}]`
        }, {
            call: centerCameraHandler,
            route: `${route}.toolsById['center-camera'].select`
        }, {
            call: zoomCallHandler(1 / 1.25),
            route: `${route}.toolsById['zoom-in'].select`
        }, {
            call: zoomCallHandler(1.25),
            route: `${route}.toolsById['zoom-out'].select`
        }, {
            call: toggleSimulatingHandler,
            route: `${route}.toolsById['toggle-simulating'].select`
        }, {
            call: toggleSelectHandler,
            route: `${route}.toolsById[
                    'toggle-sets', 'toggle-filters',
                    'toggle-timebar', 'toggle-settings',
                    'toggle-select-nodes', 'toggle-window-nodes',
                    'toggle-inspector', 'toggle-exclusions', 'toggle-histograms',
                ]
                .select`
        }, {
            call: openWorkbookHandler,
            route: `${route}.toolsById['open-workbook'].select`
        }, {
            call: forkWorkbookHandler,
            route: `${route}.toolsById['fork-workbook'].select`
        }, {
            call: saveWorkbookHandler,
            route: `${route}.toolsById['save-workbook'].select`
        }, {
            call: embedWorkbookHandler,
            route: `${route}.toolsById['embed-workbook'].select`
        }, {
            call: fullscreenWorkbookHandler,
            route: `${route}.toolsById['fullscreen-workbook'].select`
        }];

        function centerCameraHandler(path) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {
                const center = view.scene.camera.center;
                const centerPath = `
                    workbooksById['${workbook.id}']
                        .viewsById['${view.id}']
                        .scene.camera.center`;
                return [
                    $pathValue(`${centerPath}.x`, center.x = 0.5),
                    $pathValue(`${centerPath}.y`, center.y = 0.5),
                ];
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks)
        }

        function zoomCallHandler(zoomFactor) {
            return function zoomHandler(path, [factor = zoomFactor]) {

                const viewIds = [].concat(path[3]);
                const workbookIds = [].concat(path[1]);
                const { request: { query: options = {}}} = this;

                return loadViewsById({
                    workbookIds, viewIds, options
                })
                .map(({ workbook, view }) => $pathValue(`
                    workbooksById['${workbook.id}']
                        .viewsById['${view.id}']
                        .scene.camera.zoom`,
                    view.scene.camera.zoom *= factor
                ))
                .map(mapObjectsToAtoms)
                .catch(captureErrorStacks);
            }
        }

        function toggleSimulatingHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const toggleIds = [].concat(path[5]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {
                const { toolsById } = view;
                return toggleIds.reduce((values, toolId) => {

                    const tool = toolsById[toolId];
                    const selected = !tool.selected;

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .toolsById['${toolId}']
                            .selected`,
                        tool.selected = selected
                    ));

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .scene.simulating`,
                        view.scene.simulating = selected
                    ));

                    return values;
                }, []);
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function toggleSelectHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const toggleIds = [].concat(path[5]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => {
                const { toolsById } = view;
                return toggleIds.reduce((values, toolId) => {

                    const tool = toolsById[toolId];
                    const panelId = tool.panel;
                    const selected = !tool.selected;

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .toolsById['${toolId}']
                            .selected`,
                        tool.selected = selected
                    ));

                    values.push($pathValue(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            ['${panelId}'].open`,
                        view[panelId].open = selected
                    ));

                    if (selected) {
                        values.push($pathValue(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .openPanel`,
                            view.openPanel = panelId
                        ));
                    } else {
                        view.openPanel = undefined;
                        values.push($pathInvalidation(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .openPanel`
                        ));
                    }


                    return values;
                }, []);
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function openWorkbookHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => []);
        }

        function forkWorkbookHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => [])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function saveWorkbookHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => [])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function embedWorkbookHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => [])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }

        function fullscreenWorkbookHandler(path, args) {

            const viewIds = [].concat(path[3]);
            const workbookIds = [].concat(path[1]);
            const { request: { query: options = {}}} = this;

            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(({ workbook, view }) => [])
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
        }
    }
}
