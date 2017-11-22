import url from 'url';
import { loadDataset } from './datasets';
import { Observable, Scheduler } from 'rxjs';
import Binning from 'viz-app/worker/simulator/Binning';
import { cache as Cache } from '@graphistry/common';
import { $ref } from '@graphistry/falcor-json-graph';
import { load as _loadVGraph } from '../simulator/libs/VGraphLoader';
import { columns as createColumns } from 'viz-app/models/columns';
import {
    histogram as createHistogram,
    legendTypeHistogramColumn,
    legendPivotHistogramColumn,
    timebarHistogramColumn
        } from 'viz-app/models/expressions';

const unpackers = {
    null: _loadVGraph,
    vgraph: _loadVGraph,
    default: _loadVGraph,
    jsonMeta: loadVGraphJSON
};

export function loadVGraph(setEncoding, setDefaultEncoding) {
    const loadDataFrame = loadDataFrameAndUpdateBuffers(setEncoding, setDefaultEncoding);
    return function loadVGraph(view, config, s3Cache, updateSession) {
        return Observable.of({ view, loaded: false })
            .expand(loadAndUnpackVGraph(config, s3Cache, updateSession))
            .takeLast(1)
            .mergeMap(loadDataFrame);
    };
}

function loadAndUnpackVGraph(config, s3Cache, updateSession) {
    return function loadAndUnpackVGraph({ view, loaded }) {
        if (loaded === true) {
            return Observable.empty();
        }

        const { nBody } = view;
        const { dataset } = nBody;
        const unpack = unpackers[dataset.type];

        return updateSession(view, {
            progress: 100 * 2 / 10,
            status: 'init',
            message: 'Loading dataset'
        })()
            .mergeMap(() => loadDataset(dataset, config, s3Cache))
            .map(buffer => ({ metadata: dataset, body: buffer }))
            .mergeMap(
                tuple => unpack(nBody, tuple, config, s3Cache, updateSession),
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
            );
    };
}

function loadVGraphJSON(nBody, { metadata: dataset, body: buffer }, config, s3Cache) {
    const json = JSON.parse(buffer.toString('utf8'));
    const datasource = json.datasources[0];
    nBody.dataset = {
        ...dataset,
        ...json,
        type: 'vgraph',
        url: url.parse(datasource.url)
    };

    return Observable.of({ nBody, loaded: false });
}

function loadDataFrameAndUpdateBuffers(setEncoding, setDefaultEncoding) {
    return function loadDataFrame({ view }) {
        const { nBody, layout: { options } = {} } = view;
        const { dataset, simulator, simulator: { dataframe, layoutAlgorithms } } = nBody;
        // Load into dataframe data attributes that rely on the simulator existing.
        const inDegrees = dataframe.getHostBuffer('backwardsEdges').degreesTyped;
        const outDegrees = dataframe.getHostBuffer('forwardsEdges').degreesTyped;
        const unsortedEdges = dataframe.getHostBuffer('unsortedEdges');

        dataframe.loadDegrees(outDegrees, inDegrees);
        dataframe.loadEdgeDestinations(unsortedEdges);

        layoutAlgorithms.forEach(algo => {
            const layoutAlgoName = algo.algoName.toLowerCase();
            Array.from(
                layoutAlgoName in options
                    ? options[layoutAlgoName]
                    : 'length' in options ? options : []
            )
                .filter(Boolean)
                .forEach(control => {
                    const { id, value, props: { algoName } } = control;
                    nBody.updateSettings({
                        simControls: {
                            [algoName]: {
                                [id]: value
                            }
                        }
                    });
                });
        });

        // Tell all layout algorithms to load buffers from dataframe, now that
        // we're about to enable ticking
        return Observable.merge(
            ...layoutAlgorithms.map(algo =>
                Observable.defer(() => algo.updateDataframeBuffers(simulator))
            ),
            Scheduler.async
        )
            .toArray()
            .do(() => (nBody.vgraphLoaded = true))
            .flatMap(xs => {
                const complexEdgeEncodings =
                    (dataset &&
                        dataset.edges &&
                        dataset.edges[0] &&
                        dataset.edges[0].complexEncodings) ||
                    null;
                const complexNodeEncodings =
                    (dataset &&
                        dataset.nodes &&
                        dataset.nodes[0] &&
                        dataset.nodes[0].complexEncodings) ||
                    null;
                const setEncodingObservables = [complexEdgeEncodings, complexNodeEncodings]
                    .filter(Boolean)
                    .reduce(
                        (xs, encodings) => [
                            ...xs,
                            ...Object.keys(encodings.current || {}).map(encodingName =>
                                setEncoding({ view, encoding: encodings.current[encodingName] })
                            ),
                            ...Object.keys(encodings.default || {}).map(encodingName =>
                                setDefaultEncoding({
                                    view,
                                    encoding: encodings.default[encodingName]
                                })
                            )
                        ],
                        []
                    );
                return setEncodingObservables.length
                    ? Observable.forkJoin(...setEncodingObservables)
                    : Observable.of(xs);
            })
            .map(() => {
                view = createInitialHistograms(view, dataframe);
                view.scene = assignHintsToScene(view.scene, dataframe);
                view.columns = createColumns(dataframe, dataframe.getColumnsByType(true));
                if (dataframe.pointTypeIncludesEventID) {
                    view.inspector.openTab = 'event';
                    if (view.inspector.tabs[0].componentType !== 'event') {
                        view.inspector.tabs.unshift({
                            name: 'Events',
                            componentType: 'event'
                        });
                    }
                }
                return view;
            });
    };
}

function createInitialHistograms(view, dataframe) {
    const { histograms, histogramsById } = view;

    if (histograms.length) {
        return view;
    }

    const binningInstance = new Binning(dataframe);
    const initialHistograms = binningInstance
        .selectInitialColumnsForBinning(
            global.__graphistry_convict_conf__.get('app.panels.histograms.numDefault')
        )
        .map(({ type, dataType, attribute }) =>
            createHistogram({
                name: attribute,
                dataType,
                componentType: type
            })
        );

    histograms.length = initialHistograms.length;

    initialHistograms.forEach((histogram, index) => {
        histogramsById[histogram.id] = histogram;
        histograms[index] = $ref(`${view.absolutePath}
            .histogramsById['${histogram.id}']`);
    });

    histogramsById.legendTypeHistogram = createHistogram({name: legendTypeHistogramColumn, dataType: 'string', componentType: 'point'}, 'legendTypeHistogram');
    histogramsById.legendPivotHistogram = createHistogram({name: legendPivotHistogramColumn, dataType: 'number', componentType: 'point'}, 'legendPivotHistogram');
    histogramsById.timebarHistogram = createHistogram({name: timebarHistogramColumn, dataType: 'string', componentType: 'point'}, 'timebarHistogram');

    return view;
}

function assignHintsToScene(scene, dataframe) {
    scene.renderer.edges.elements = dataframe.numEdges();
    scene.renderer.points.elements = dataframe.numPoints();

    return scene;
}
