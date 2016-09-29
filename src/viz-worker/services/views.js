import Color from 'color';
import { view as createView } from 'viz-shared/models/views';
import { ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';
import { toClient as fromLayoutAlgorithms } from '../simulator/layout.config';

export function loadViews(loadDatasetNBody, loadWorkbooksById) {
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
                        workbook.id, nBody.scene.id, viewId
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

    const { scene, layout, layout: { options }} = view;
    const { simulator: { controls: { layoutAlgorithms } }} = nBody;

    view.nBody = nBody;

    let background = nBody.bg;

    if (typeof background !== 'undefined') {
        try {
            background = new Color(background);
        } catch (e) {
            background = scene.background.color;
        }
    } else {
        background = scene.background.color;
    }

    scene.background.color = background;

    if (options.length === 0) {
        const optionsPath = `workbooksById['${workbook.id}']
                            .viewsById['${view.id}']
                            .layout.options`;
        layout.options = ([]
            .concat(fromLayoutAlgorithms(layoutAlgorithms))
            .reduce((options, { name, params }, index) => {
                options.name = name;
                options.id = name.toLowerCase();
                return { ...options, ...toControls(optionsPath, params) };
            }, options)
        );
    }

    return view;
}

const controlLeafKeys = {
    displayName: true,
    id: true, type: true,
    name: true, value: true
};

function toControls(options, params) {
    return params.reduce((controls, control, index) => {

        const { type, value } = control;
        const id = control.id || control.name;
        const name = control.displayName || control.name;
        const props = Object.keys(control).filter((name) => !(
                name in controlLeafKeys
            ))
            .reduce((props, key) => ((
                props[key] = control[key]) &&
                props || props), {});

        controls[index] = {
            id, name, type, props, value,
            stateKey: 'value',
            state: $ref(`${options}[${index}]`)
        };

        return controls;
    }, { length: params.length });
}
