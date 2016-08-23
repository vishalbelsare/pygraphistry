import Color from 'color';
import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from 'reaxtor-falcor-json-graph';

import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function toolbar(path, base) {
    return function toolbar({ loadViewsById }) {

        const getValues = getHandler(path, loadViewsById);

        return [{
            returns: 'Reference',
            get: getValues,
            route: `${base}.toolbar`
        }, {
            returns: 'Boolean',
            get: getValues,
            route: `${base}.toolbars[{keys}].visible`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}.toolbars[{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}.toolbars[{keys}][{keys}]`
        }, {
            returns: '*',
            get: getValues,
            route: `${base}.toolbars[{keys}][{keys}][{keys}]`
        }];

        function loadToolbarsById({
            workbookIds, viewIds, toolbarIds, controlIds, options
        }) {
            return loadViewsById({
                workbookIds, viewIds, options
            })
            .mergeMap(
                ({ workbook, view }) => toolbarIds,
                ({ workbook, view }, toolbarIds) => ({
                    workbook, view, toolbar: view.toolbarsById[toolbarIds]
                })
            );
        }
    }
}

/*
export function toolbar(path, route) {
    return function toolbar({ loadViewsById }) {
        const getValues = getHandler(path, loadViewsById);
        return [{
            get: getValues,
            route: `${route}.toolbar`,
            returns: `*`
        }, {
            returns: `*`,
            get: getValues,
            route: `${route}[
                'appToolbar', 'betaToolbar', 'iFrameToolbar'
            ][{keys}]`
        }, {
            returns: `*`,
            get: getValues,
            route: `${route}[
                'toolsById', 'appToolbar', 'betaToolbar', 'iFrameToolbar'
            ][{keys}][{keys}]`
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
            call: toggleInspectorOrTimebarHandler,
            route: `${route}.toolsById[
                    'toggle-timebar', 'toggle-inspector'
                ]
                .select`
        }, {
            call: toggleSelectHandler,
            route: `${route}.toolsById[
                    'toggle-sets', 'toggle-filters', 'toggle-settings',
                    'toggle-select-nodes', 'toggle-window-nodes',
                    'toggle-exclusions', 'toggle-histograms'
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
                    $value(`${centerPath}.x`, center.x = 0.5),
                    $value(`${centerPath}.y`, center.y = 0.5),
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
                .map(({ workbook, view }) => $value(`
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

                    values.push($value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .toolsById['${toolId}']
                            .selected`,
                        tool.selected = selected
                    ));

                    values.push($value(`
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

        function toggleInspectorOrTimebarHandler(path, args) {

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

                    values.push(
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .timebar.open`,
                            view.timebar.open = false
                        ),
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .inspector.open`,
                            view.inspector.open = false
                        ),
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .toolsById['toggle-timebar']
                                .selected`,
                            toolsById['toggle-timebar'].selected = false
                        ),
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .toolsById['toggle-inspector']
                                .selected`,
                            toolsById['toggle-inspector'].selected = false
                        ),
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                ['${panelId}'].open`,
                            view[panelId].open = selected
                        ),
                        $value(`
                            workbooksById['${workbook.id}']
                                .viewsById['${view.id}']
                                .toolsById['${toolId}']
                                .selected`,
                            tool.selected = selected
                        )
                    );

                    return values;
                }, []);
            });
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

                    values.push($value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .toolsById['${toolId}']
                            .selected`,
                        tool.selected = selected
                    ));

                    values.push($value(`
                        workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            ['${panelId}'].open`,
                        view[panelId].open = selected
                    ));

                    // if (selected) {
                    //     values.push($value(`
                    //         workbooksById['${workbook.id}']
                    //             .viewsById['${view.id}']
                    //             .openPanel`,
                    //         view.openPanel = panelId
                    //     ));
                    // } else {
                    //     view.openPanel = undefined;
                    //     values.push($invalidate(`
                    //         workbooksById['${workbook.id}']
                    //             .viewsById['${view.id}']
                    //             .openPanel`
                    //     ));
                    // }


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
*/
