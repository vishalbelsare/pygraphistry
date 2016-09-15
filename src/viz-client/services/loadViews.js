import { ref as $ref } from '@graphistry/falcor-json-graph';
import { loadWorkbooks } from './loadWorkbooks';
import { view as createView } from 'viz-shared/models/views';

export function loadViews(workbooksById) {
    const loadWorkbooksById = loadWorkbooks(workbooksById);
    return function loadViewsById({ workbookIds, viewIds, options = {} }) {
        return loadWorkbooksById({
            workbookIds, options
        })
        .mergeMap(
            ({ workbook }) => viewIds,
            ({ workbook }, viewId) => ({
                workbook, view: assignViewToWorkbook(
                    workbook, workbook.viewsById[viewId] || createView(
                        workbook.id, workbook.datasets.current, viewId
                ))
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
        views[viewIndex] = $ref(`workbooksById['${workbookId}'].views.current`);
        if (!currentView) {
            views.current = $ref(`workbooksById['${workbookId}'].viewsById['${viewId}']`);
        }
    }

    return view;
}

