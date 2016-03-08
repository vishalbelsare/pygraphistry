import { Observable } from 'rxjs/Observable';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/catch';

import { createID } from './createID';
import { loadDocument } from '../../workbook';
import { createWorkbook } from './createWorkbook';

export function loadWorkbook(workbooksById, workbookId, options) {
    if (workbooksById[workbookId]) {
        return Observable.of(workbooksById[workbookId]);
    }
    return Observable
        .from(loadDocument(workbookId))
        .map(migrateWorkbook)
        .catch((e) => Observable.of(createWorkbook(workbookId, options)))
        .do((workbook) => {
            workbook.id = workbookId;
            workbooksById[workbookId] = workbook;
        });
}

function migrateWorkbook(workbook) {
    if (!workbook.id) {
        workbook.id = createID();
    }
    return migrateDatasets(migrateViews(workbook));
}

function migrateViews(workbook) {

    if (workbook.viewsById) {
        return workbook;
    }

    const viewsById = {};
    const viewsList = { length: 0 };
    const workbookViews = workbook.views;

    let currentView = workbookViews[workbook.currentView || 'default'];
    let currentViewIndex = 0;

    for (const viewId in workbookViews) {

        if (!workbookViews.hasOwnProperty(viewId)) {
            continue;
        }

        const view = workbookViews[viewId];

        if (!currentView) {
            currentView = view;
            currentViewIndex = viewsList.length;
        } else if (currentView === view) {
            currentViewIndex = viewsList.length;
        }

        if (!view.id) {
            view.id = createID();
        }

        viewsById[view.id] = view;
        viewsList[viewsList.length++] = $ref(`workbooksById['${workbook.id}'].viewsById['${view.id}']`);
    }

    if (!currentView) {
        currentView = createView(createID());
        currentViewIndex = viewsList.length;
        viewsById[currentView.id] = currentView;
        viewsList[viewsList.length++] = $ref(`workbooksById['${workbook.id}'].viewsById['${currentView.id}']`);
    }

    viewsList.current = $ref(`workbooksById['${workbook.id}'].views['${currentViewIndex}']`);

    workbook.views = viewsList;
    workbook.viewsById = viewsById;

    return workbook;
}

function migrateDatasets(workbook) {

    if (workbook.datasetsById) {
        return workbook;
    }

    const datasetsById = {};
    const datasetsList = { length: 0 };
    const workbookDatasets = workbook.datasetReferences;

    for (const datasetId in workbookDatasets) {

        if (!workbookDatasets.hasOwnProperty(datasetId)) {
            continue;
        }

        const dataset = workbookDatasets[datasetId];

        if (!dataset.id) {
            dataset.id = createID();
        }

        dataset.name = datasetId;
        dataset.url = datasetId;

        datasetsById[dataset.id] = dataset;
        datasetsList[datasetsList.length++] = $ref(`workbooksById['${workbook.id}'].datasetsById['${dataset.id}']`);
    }

    workbook.datasets = datasetsList;
    workbook.datasetsById = datasetsById;

    return workbook;
}
