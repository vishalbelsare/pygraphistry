import url from 'url';
import { loadDataset } from './loadDataset';
import { Observable } from 'rxjs';
import { cache as Cache } from '@graphistry/common';
import { load as _loadVGraph } from '../simulator/libs/VGraphLoader';

const unpackers = {
    'null': _loadVGraph,
    'vgraph': _loadVGraph,
    'default': _loadVGraph,
    'jsonMeta': loadVGraphJSON
};

export function loadVGraph(view, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return Observable
        .of({ view, loaded: false })
        .expand(loadAndUnpackVGraph(config, s3Cache))
        .takeLast(1)
        .map(loadDataFrameAndUpdateBuffers)
}

function loadAndUnpackVGraph(config, s3Cache) {
    return function loadAndUnpackVGraph({ view, loaded }) {

        if (loaded === true) {
            return Observable.empty();
        }

        const { nBody } = view;
        const { dataset } = nBody;
        const unpack = unpackers[dataset.type];

        return loadDataset(dataset, config, s3Cache)
            .map((buffer) => ({ metadata: dataset, body: buffer }))
            .mergeMap(
                (tuple) => unpack(nBody, tuple, config, s3Cache),
                (tuple, nBodyOrTuple) => {
                    let loaded = false;
                    if (nBodyOrTuple.loaded === false) {
                        view.nBody = nBodyOrTuple.nBody;
                    } else {
                        loaded = true;
                        view.nBody = nBodyOrTuple;
                    }
                    return { view, loaded };
                }
                // (tuple, nBodyOrTuple) => ((nBodyOrTuple.loaded === false) ?
                //     { ...nBodyOrTuple } :
                //     { nBody: nBodyOrTuple, loaded: true }
                // )
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

function loadDataFrameAndUpdateBuffers({ view }) {

    const { nBody, filters } = view;
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

    view.scene = assignHintsToScene(view.scene, dataframe);
    view.expressions = createExpressionTemplates(dataframe);

    return view;
}

function assignHintsToScene(scene, dataframe) {

    const MAX_SIZE_TO_ALLOCATE = 2000000;
    const numEdges = dataframe.numEdges();
    const numPoints = dataframe.numPoints();

    scene.canvas.hints = {
        edges: Math.min(numEdges, MAX_SIZE_TO_ALLOCATE),
        points: Math.min(numPoints, MAX_SIZE_TO_ALLOCATE),
    };

    return scene;
}

function createExpressionTemplates(dataframe) {

    const expressions = [];
    const columnsByComponentType = dataframe.getColumnsByType(true);

    /*        { point, edge } */
    for (const componentType in columnsByComponentType) {

        if (!columnsByComponentType.hasOwnProperty(componentType)) {
            continue;
        }

        const columnsByName = columnsByComponentType[componentType];

        for (const columnName in columnsByName) {

            if (!columnsByName.hasOwnProperty(columnName)) {
                continue;
            }

            const column = columnsByName[columnName];
            const expressionName = columnName === column.name ?
                columnName : column.name;

            const expresionAttribute = columnName.indexOf(componentType) === 0 ?
                expressionName : `${componentType}:${expressionName}`;

            expressions.push({
                name: expressionName,
                dataType: column.type,
                attribute: expresionAttribute
            });
        }
    }

    return expressions;
}
