import { Observable } from 'rxjs/Observable';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/do';
import 'rxjs/add/operator/mergeMap';

import { loadWorkbooks } from './loadWorkbook';
import { downloadDataset } from '../../data-loader';

export function loadDataset(datasetsById, datasetId, options = { url: datasetId }) {

    if (datasetsById[datasetId]) {
        return Observable.of(datasetsById[datasetId]);
    }

    return Observable
        .from(downloadDataset(options))
        .do((dataset) => {
            dataset.id = datasetId;
            datasetsById[datasetId] = dataset;
        });
}

export function loadDatasets({ workbooksById, workbookIds, datasetsById, datasetIds }) {
    return loadWorkbooks({
            workbooksById, workbookIds
        })
        .mergeMap(
            (workbook) => Observable.from(datasetIds),
            (workbook, datasetId) => ({ workbook, datasetId })
        )
        .mergeMap(
            ({ workbook, datasetId }) => loadDataset(
                datasetsById, datasetId,
                workbook.datasetsById[datasetId]
            ),
            ({ workbook, datasetId }, dataset) => ({ workbook, dataset })
        );
}
