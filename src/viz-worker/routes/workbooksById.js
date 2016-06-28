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

import { loadDatasets } from './support/loadDataset';
import { loadGraphDriver } from './support/loadGraphDriver';
import { loadWorkbook, loadWorkbooks, loadViews } from './support/loadWorkbook';

export function views(workbooksById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].views[{keys: viewsKeys}]`,
        get({ workbookIds, viewsKeys }) {
            return loadWorkbooks({
                    workbooksById, workbookIds
                })
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
            return loadViews({
                    workbooksById, workbookIds, viewIds
                })
                .do(({ view }) => viewConfig.next(view))
                .mergeMap(
                    ({ workbook, view }) => Observable.from(viewKeys),
                    ({ workbook, view }, viewKey) => {
                        const val = view[viewKey];
                        const path = `workbooksById['${workbook.id}'].viewsById['${view.id}']['${viewKey}']`;
                        return $pathValue(path, $atom(val));
                    }
                );
        }
    }, {
        route: `workbooksById[{keys: workbookIds}].viewsById[{keys: viewIds}].legend[{keys: legendKeys}]`,
        get({ workbookIds, viewIds, legendKeys }) {
            return loadViews({
                    workbooksById, workbookIds, viewIds
                })
                .mergeMap(
                    ({ workbook, view }) => Observable.from(legendKeys),
                    ({ workbook, view }, legendKey) => {
                        const val = view.legend[legendKey];
                        const path = `workbooksById['${workbook.id}'].viewsById['${view.id}'].legend['${legendKey}']`;
                        return $pathValue(path, $atom(val));
                    }
                );
        }
    }];
}

export function datasets(workbooksById, datasetsById) {
    return [{
        route: `workbooksById[{keys: workbookIds}].datasets[{keys: datasetsKeys}]`,
        get({ workbookIds, datasetsKeys }) {
            return loadWorkbooks({
                    workbooksById, workbookIds
                })
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
            const { server } = this;
            const { socket } = server;
            return loadDatasets({
                    workbooksById, workbookIds, datasetsById, datasetIds
                })
                .mergeMap(
                    ({ workbook, dataset }) => loadGraphDriver({
                        graphsById, workbook, dataset, socket, server
                    }),
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
