import url from 'url';
import { loadDataset } from './datasets';
import { nBody as createNBody } from '../models';
import { cache as Cache } from '@graphistry/common';
import { Observable, ReplaySubject } from 'rxjs';
import { dataset as createDataset } from 'viz-shared/models/workbooks';

export function loadNBody(nBodiesById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return function loadDatasetNBody({ workbook, options = {} }) {
        const dataset = getCurrentDataset(workbook, options);
        return (dataset.id in nBodiesById) ?
            nBodiesById[dataset.id] : (
            nBodiesById[dataset.id] = Observable
                .of(dataset)
                .expand(loadDatasetSourceMetadata(config, s3Cache))
                .takeLast(1)
                .map(createNBody)
                .multicast(new ReplaySubject(1))
                .refCount()
                .let((nBodyObs) => nBodyObs.do((nBody) => {
                    nBodiesById[nBody.id] =
                    nBodiesById[dataset.id] = nBodyObs;
                }))
            );
    }
}

export function setLayoutControl(loadViewsById) {
    return function ({ workbookId, viewId, algoName, value, id }) {
        return loadViewsById({
            workbookIds: [workbookId], viewIds: [viewId]
        }).do(({ view }) => {
            const { nBody } = view;
            nBody.interactions.next({
                play: true, layout: true, simControls: {
                    [algoName]: {
                        [id]: value
                    }
                }
            });
        });
    }
}

function getCurrentDataset(workbook, options) {

    const { datasets } = workbook;

    let datasetsIndex = -1;
    const datasetsLen = datasets.length;
    const datasetName = options.dataset;

    while (++datasetsIndex < datasetsLen) {
        const dataset = datasets[datasetsIndex];
        if (dataset.name === datasetName || datasetName == null) {
            return dataset;
        }
    }

    return datasets[datasetsIndex] || (
           datasets[datasetsIndex] = createDataset(options));
}

function loadDatasetSourceMetadata(config, s3Cache) {
    return function loadDatasetSourceMetadata(dataset) {
        return (dataset.type !== 'jsonMeta') ?
            Observable.empty() :
            loadDataset(dataset, config, s3Cache).map((buffer) => {
                const json = JSON.parse(buffer.toString('utf8'));
                const datasource = json.datasources[0];
                return {
                    ...dataset,
                    ...datasource, type: 'vgraph',
                    url: url.parse(datasource.url)
                };
            });
    }
}
