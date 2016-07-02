import url from 'url';
import { loadDataset } from './loadDataset';
import { Observable } from '@graphistry/rxjs';
import { cache as Cache } from '@graphistry/common';
import { load as _loadVGraph } from '../simulator/libs/VGraphLoader';

const unpackers = {
    'null': _loadVGraph,
    'vgraph': _loadVGraph,
    'default': _loadVGraph,
    'jsonMeta': loadVGraphJSON
};

export function loadVGraph(nBody, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return Observable
        .of({ nBody, loaded: false })
        .expand(loadAndUnpackVGraph(config, s3Cache))
        .takeLast(1)
        .map(loadDataFrameAndUpdateBuffers)
}

function loadAndUnpackVGraph(config, s3Cache) {
    return function loadAndUnpackVGraph({ nBody, loaded }) {

        if (loaded === true) {
            return Observable.empty();
        }

        const { dataset } = nBody;
        const unpack = unpackers[dataset.type];

        return loadDataset(dataset, config, s3Cache)
            .map((buffer) => ({ metadata: dataset, body: buffer }))
            .mergeMap(
                (tuple) => unpack(nBody, tuple, config, s3Cache),
                (tuple, nBodyOrTuple) => ((nBodyOrTuple.loaded === false) ?
                    { ...nBodyOrTuple } :
                    { nBody: nBodyOrTuple, loaded: true }
                )
            );
    }
}

function loadVGraphJSON(nBody, { metadata: dataset, body: buffer }, config, s3Cache) {
    const json = JSON.parse(buffer.toString('utf8'));
    const datasource = json.datasources[0];
    nBody.dataset = {
        ...dataset,
        ...datasource, type: 'vgraph',
        url: url.parse(datasource.url)
    };
    return Observable.of({ nBody, loaded: false })
}

function loadDataFrameAndUpdateBuffers({ nBody }) {

    const { simulator, simulator: { dataframe }} = nBody;
    // Load into dataframe data attributes that rely on the simulator existing.
    const inDegrees = dataframe.getHostBuffer('backwardsEdges').degreesTyped;
    const outDegrees = dataframe.getHostBuffer('forwardsEdges').degreesTyped;
    const unsortedEdges = dataframe.getHostBuffer('unsortedEdges');

    dataframe.loadDegrees(outDegrees, inDegrees);
    dataframe.loadEdgeDestinations(unsortedEdges);

    // Tell all layout algorithms to load buffers from dataframe, now that
    // we're about to enable ticking
    simulator.layoutAlgorithms.forEach((layoutAlgorithm) => {
        layoutAlgorithm.updateDataframeBuffers(simulator);
    });

    return nBody;
}
