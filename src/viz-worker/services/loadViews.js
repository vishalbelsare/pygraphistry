import { loadNBody } from './loadNBody';
import { loadWorkbooks } from './loadWorkbooks';
import { cache as Cache } from '@graphistry/common';
import { view as createView } from '../../viz-shared/models';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { toClient as fromLayoutAlgorithms } from '../simulator/layout.config';
import { ref as $ref,
         atom as $atom } from 'falcor-json-graph';

export function loadViews(workbooksById, nBodiesById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {

    const loadDatasetNBody = loadNBody(nBodiesById, config, s3Cache);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3Cache);

    return function loadViewsById({ workbookIds, viewIds, options = {} }) {
        return loadWorkbooksById({
            workbookIds, options
        })
        .mergeMap(
            ({ workbook }) => loadDatasetNBody({ workbook, options }),
            ({ workbook }, nBody) => ({ workbook, nBody })
        )
        .mergeMap(
            ({ workbook, nBody }) => viewIds,
            ({ workbook, nBody }, viewId) => ({
                workbook, view: assignViewToWorkbook(workbook, assignNBodyToView(
                    workbook, nBody, workbook.viewsById[viewId] || createView(
                        workbook.id, nBody.scene, options, viewId
                )))
            })
        );
    }
}

function assignViewToWorkbook(workbook, view) {

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
    }

    return view;
}

function assignNBodyToView(workbook, nBody, view) {

    const { simulator, simulator: { dataframe }} = nBody;
    const { settings, settingsById } = toSettings(
        workbook.id, view.id, ... fromLayoutAlgorithms(
            simulator.controls.layoutAlgorithms
        )
    );

    const MAX_SIZE_TO_ALLOCATE = 2000000;
    const numEdges = dataframe.numEdges();
    const numPoints = dataframe.numPoints();

    view.nBody = nBody;
    view.scene.hints = {
        edges: numEdges === undefined ?
            $atom(undefined, { $expires: 1 }) :
            Math.min(numEdges, MAX_SIZE_TO_ALLOCATE),
        points: numPoints === undefined ?
            $atom(undefined, { $expires: 1 }) :
            Math.min(numPoints, MAX_SIZE_TO_ALLOCATE),
    };

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
