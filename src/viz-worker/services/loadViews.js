import { cache as Cache } from '@graphistry/common';
import { loadGraph } from './loadGraph';
import { ref as $ref } from 'falcor-json-graph';
import { loadWorkbooks } from './loadWorkbooks';
import { view as createView } from '../../viz-shared/models';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { toClient as fromLayoutAlgorithms } from '../simulator/layout.config';

export function loadViews(workbooksById, graphsById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    const loadCurrentGraph = loadGraph(graphsById, config, s3Cache);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3Cache);
    return function loadViewsById({ workbookIds, viewIds, server, options = {} }) {
        return loadWorkbooksById({
            workbookIds, server, options
        })
        .mergeMap(
            ({ workbook }) => loadCurrentGraph({ workbook, server }),
            ({ workbook }, graph) => ({ workbook, graph })
        )
        .mergeMap(
            ({ workbook, graph }) => viewIds,
            ({ workbook, graph }, viewId) => ({
                workbook, view: assignViewToWorkbook(server, workbook, assignGraphToView(
                    workbook, graph, workbook.viewsById[viewId] || createView(
                        workbook.id, graph, viewId
                )))
            })
        );
    }
}

function assignViewToWorkbook(server, workbook, view) {

    const { id: viewId } = view;
    const { id: workbookId, viewsById, views } = workbook;

    if (!viewsById[viewId]) {

        const viewIndex = views.length;
        const currentView = views.current;

        viewsById[viewId] = view;
        views.length = viewIndex + 1;
        views[viewIndex] = $ref(`workbooksById['${workbookId}'].viewsById['${viewId}']`);

        if (!currentView) {
            views.current = $ref(`workbooksById['${workbookId}'].views['${viewIndex}']`);
        }

        // TODO: refactor everything in server-viz so we can delete these lines
        server && server.viewConfig.next(view);
        server && server.renderConfig.next(view.scene);
    }

    return view;
}

function assignGraphToView(workbook, graph, view) {

    const { simulator } = graph;
    const { settings, settingsById } = toSettings(
        workbook.id, view.id, ... fromLayoutAlgorithms(
            simulator.controls.layoutAlgorithms
        )
    );

    view.graph = graph;
    view.scene.settings = settings;
    view.scene.settingsById = {
        ... view.scene.settingsById, ... settingsById
    };

    return view;
}

const controlLeafKeys = {
    displayName: true,
    id: true, type: true,
    name: true, view: true
};

function toSettings(workbookId, viewId, ...settings) {
    return settings.reduce(({ settings, settingsById }, { name, params }) => {

        const settingsId = name.toLowerCase();

        settingsById[settingsId] = {
            name, id: settingsId, ...toControls(
                workbookId, viewId, settingsId, ...params
            )
        };

        settings.push($ref(`
            workbooksById['${workbookId}']
                .viewsById['${viewId}']
                .scene
                .settingsById['${settingsId}']`));

        return { settings, settingsById };
    }, { settings: [], settingsById: {} });
}

function toControls(workbookId, viewId, settingsId, ...params) {
    return params.reduce(({ controls, controlsById }, control) => {

        const { type, value } = control;
        const id = control.id || control.name;
        const name = control.displayName || control.name;
        const props = Object.keys(control).filter((name) => !(
                name in controlLeafKeys
            ))
            .reduce((props, key) => ((
                props[key] = control[key]) &&
                props || props), {});

        controlsById[id] = { id, name, type, props, value };
        controls.push($ref(`
                workbooksById['${workbookId}']
                    .viewsById['${viewId}']
                    .scene
                    .settingsById['${settingsId}']
                    .controlsById['${id}']`));

        return { controls, controlsById };
    }, { controls: [], controlsById: {} });
}
