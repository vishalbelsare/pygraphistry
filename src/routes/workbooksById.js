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
import { renderGraphDataset } from './support/renderGraphDataset';

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
    }];
}

export function datasetsById(workbooksById, datasetsById, graphsById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].datasetsById[{keys: datasetIds}].graph[{keys: graphKeys}]`,
        get({ workbookIds, datasetIds, graphKeys }) {
            return Observable
                .from(workbookIds)
                .mergeMap((workbookId) => loadWorkbook(workbooksById, workbookId))
                .mergeMap(
                    (workbook) => Observable.from(datasetIds),
                    (workbook, datasetId) => ({ workbook, datasetId })
                )
                .mergeMap(
                    ({ workbook, datasetId }) =>
                        loadDataset(datasetsById, datasetId, workbook.datasetsById[datasetId]),
                    ({ workbook, datasetId }, dataset) => ({ workbook, dataset })
                )
                .mergeMap(
                    ({ workbook, dataset }) => renderGraphDataset(dataset),
                    ({ workbook, dataset }, graph) => ({ workbook, dataset, graph })
                )
                .mergeMap(
                    ({ workbook, dataset, graph }) => Observable.from(graphKeys),
                    ({ workbook, dataset, graph }, key) => {
                        const val = graph[key];
                        const path = `workbooksById['${workbook.id}'].datasetsById['${dataset.id}'].graph['${key}']`;
                        return $pathValue(path, $atom(val));
                    }
                );
        }
    }];
}
