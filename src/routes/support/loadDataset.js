import { Observable } from 'rxjs/Observable';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/do';

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
