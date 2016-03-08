import { Observable } from 'rxjs/Observable';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

import 'rxjs/add/observable/from';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeAll';
import 'rxjs/add/operator/mergeMap';

import { loadDataset } from './support/loadDataset';
import { loadWorkbook } from './support/loadWorkbook';

export function views(workbooksById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].views[{keys: viewsKeys}]`,
        get({ workbookIds, viewsKeys }) {
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) => Observable.from(viewsKeys),
                    (workbook, viewsKey) => {
                        const val = workbook.views[viewsKey];
                        const path = `workbooksById['${workbook.id}'].views['${viewsKey}']`;
                        return $pathValue(path, val);
                    }
                );
        }
    }];
}

export function viewsById(workbooksById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].viewsById[{keys: viewIds}][{keys: viewKeys}]`,
        get({ workbookIds, viewIds, viewKeys }) {
            const { viewConfig } = this.server;
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) =>
                        Observable.from(viewIds)
                            .map((viewId) => workbook.viewsById[viewId]),
                    (workbook, view) => {
                        viewConfig.next(view);
                        return Observable.from(viewKeys).map((viewKey) => {
                            const val = view[viewKey];
                            const path = `workbooksById['${workbook.id}'].viewsById['${view.id}']['${viewKey}']`;
                            return $pathValue(path, $atom(val));
                        });
                    }
                )
                .mergeAll();
        }
    }, {
        route: `workbooksById[{keys: workbookIds}].viewsById[{keys: viewIds}].legend[{keys: legendKeys}]`,
        get({ workbookIds, viewIds, legendKeys }) {
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) =>
                        Observable.from(viewIds)
                            .map((viewId) => workbook.viewsById[viewId]),
                    (workbook, view) => {
                        const legend = view.legend;
                        return Observable.from(legendKeys).map((legendKey) => {
                            const val = legend[legendKey];
                            const path = `workbooksById['${workbook.id}'].viewsById['${view.id}'].legend['${legendKey}']`;
                            return $pathValue(path, $atom(val));
                        });
                    }
                )
                .mergeAll();
        }
    }];
}

export function datasets(workbooksById, datasetsById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].datasets[{keys: datasetsKeys}]`,
        get({ workbookIds, datasetsKeys }) {
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) => Observable.from(datasetsKeys),
                    (workbook, datasetsKey) => {
                        const val = workbook.datasets[datasetsKey];
                        const path = `workbooksById['${workbook.id}'].datasets['${datasetsKey}']`;
                        return $pathValue(path, val);
                    }
                );
        }
    }, {
        route: `workbooksById[{keys: workbookIds}].datasetsById[{keys: datasetIds}]`,
        get({ workbookIds, datasetIds }) {
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) =>
                        Observable.from(datasetIds)
                            .map((datasetId) => workbook.datasetsById[datasetId]),
                    (workbook, dataset) =>
                        loadDataset(datasetsById, dataset.id, dataset)
                            .map((dataset) => ({ workbook, dataset }))
                )
                .mergeAll()
                .map(({ workbook, dataset }) => {
                    const ref = $ref(`datasetsById['${dataset.id}']`);
                    const path = `workbooksById['${workbook.id}'].datasetsById['${dataset.id}']`;
                    return $pathValue(path, ref);
                });
        }
    }];
}
