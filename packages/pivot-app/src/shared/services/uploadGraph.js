import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import { DataFrame, Row } from 'dataframe-js';
import FakeDataFrame from '../DataFrame';
import _ from 'underscore';
import zlib from 'zlib';
import request from 'request';

import logger from '../../shared/logger.js';
const log = logger.createLogger('pivot-app', __filename);


function upload(etlService, apiKey, data) {
    const gzipObservable = Observable.bindNodeCallback(zlib.gzip.bind(zlib));
    const upload0Wrapped = Observable.bindNodeCallback(upload0.bind(null));

    if (data.graph.length === 0) {
        return Observable.throw(new Error('No edges to upload!'));
    }

    log.trace(data, 'Content to be ETLed');
    const gzipped = gzipObservable(new Buffer(JSON.stringify(data), { level : 1}));
    return gzipped.switchMap(buffer =>
        upload0Wrapped(etlService, apiKey, buffer)
            .map(() =>  data.name)
    );
}

//jsonGraph * (err? -> ())? -> ()
function upload0(etlService, apiKey, data, cb) {
    cb = cb || function (err, res) {
        if (err) {
            return log.error(err, 'ETL upload error');
        } else {
            return log.debug(res, 'ETL success');
        }
    };

    const headers = {'Content-Encoding': 'gzip', 'Content-Type': 'application/json'};
    request.post({
        uri: etlService,
        qs: getQuery(apiKey),
        headers: headers,
        body: data,
        callback: function (err, res, body) {
            if (err) { return cb(err); }
            try {
                log.debug('Trying to parse response body', body)
                const json = JSON.parse(body);
                if (!json.success) {
                    log.trace('Success flag unset:', json.success);
                    throw new Error(body);
                }
                return cb(undefined, body);
            } catch (e) {
                return cb(e);
            }
        }
    });
}


function getQuery(key) {
    return {
        'key': key,
        'agent': 'pivot-app',
        'agentversion': '0.0.1',
        'apiversion': 1
    };
}


const previousGraph = {
    graph: [],
    labels: []
};


function createGraph(pivots) {
    const name = `PivotApp/${simpleflake().toJSON()}`;
    const type = "edgelist";
    const bindings = {
        "sourceField": "source",
        "destinationField": "destination",
        "idField": "node"
    }
    const mergedPivots = {
        graph:[],
        labels: []
    };

    pivots.forEach((pivot, index) => {
        if (pivot.results && pivot.enabled) {
            // Set attribute for pivot number
            const graph = pivot.results.graph.map((edge) => Object.assign({}, edge, {'Pivot': index}));
            mergedPivots.graph = [...mergedPivots.graph, ...graph]
            mergedPivots.labels = [...mergedPivots.labels, ...pivot.results.labels];
        }
    });

    // Hack for demo.
    const edges = mergedPivots.graph;
    const seen = {};
    const dedupEdges = edges.filter(({source, destination}) => {
        const isFiltered = seen.hasOwnProperty(JSON.stringify({source, destination})) ?
            false :
            seen[JSON.stringify({source, destination})] = true
        return isFiltered;
    })
    mergedPivots.graph = dedupEdges;
    mergedPivots.labels = _.map(
        _.groupBy(mergedPivots.labels, label => label.node),
        group => group[0]
    );

    const newEdges = _.difference(mergedPivots.graph, previousGraph.graph);
    const removedEdges = _.difference(previousGraph.graph, mergedPivots.graph);
    const newNodes = _.difference(mergedPivots.labels, previousGraph.labels);
    const removedNodes = _.difference(previousGraph.labels, mergedPivots.labels);

    FakeDataFrame.addEdges(newEdges);
    FakeDataFrame.removeEdges(removedEdges);
    FakeDataFrame.addNodes(newNodes);
    FakeDataFrame.removeNodes(removedNodes);

    const uploadData = {
        graph: FakeDataFrame.getData().edges,
        labels: FakeDataFrame.getData().nodes,
        name, type, bindings
    };

    previousGraph.graph = uploadData.graph;
    previousGraph.labels = uploadData.labels;

    return { pivots, data:uploadData };
}

function makeEventTable({pivots}) {
    function fieldSummary(mergedData, field) {

        const distinct =  mergedData.distinct(field).toArray();

        var res = {
            numDistinct: distinct.length
        };

        if (res.numDistinct <= 12) {
            res.values = distinct;
        }

        return res;
    }

    const dataFrames = pivots
        .filter(pivot => pivot.df !== undefined)
        .map(pivot => pivot.df);

    const fields = _.uniq(
        _.flatten(
            dataFrames.map(df => df.listColumns())
        )
    );
    log.debug('Union of all pivot fields', fields);

    const zeroDf = new DataFrame([], fields);
    const mergedData = dataFrames.reduce((a, b) => {
        return a.union(new DataFrame(b, fields));
    }, zeroDf);

    var fieldSummaries = {};
    fields.forEach(field =>
        fieldSummaries[field] = fieldSummary(mergedData, field)
    );

    const table = mergedData.toCollection();

    return {
        fieldSummaries: fieldSummaries,
        table: table
    };
}

export function uploadGraph({loadInvestigationsById, loadPivotsById, loadUsersById,
                             investigationIds}) {
    return loadInvestigationsById({investigationIds})
        .mergeMap(
            ({app, investigation}) =>
                Observable.combineLatest(
                    loadUsersById({userIds: [app.currentUser.value[1]]}),
                    loadPivotsById({pivotIds: investigation.pivots.map(x => x.value[1])})
                        .map(({app, pivot}) => pivot)
                        .toArray()
                        .map(createGraph),
                    ({user}, {pivots, data}) => ({user, pivots, data})
                )
                .switchMap(({user, data, pivots}) => {
                    if (data.graph.length > 0) {
                        return upload(user.etlService, user.apiKey, data)
                                    .map(dataset => ({user, dataset, data, pivots}));
                    } else {
                        log.debug('Graph is empty, skipping upload');
                        return Observable.of({user, data, pivots});
                    }
                })
                .do(({user, dataset, data, pivots}) => {
                    investigation.eventTable = makeEventTable({data, pivots});
                    if (dataset) {
                        investigation.url = `${user.vizService}&dataset=${dataset}`;
                        investigation.status = {ok: true};
                    } else {
                        investigation.status = {
                            ok: false,
                            message: 'No events found!',
                            msgStyle: 'info',
                        }
                    }
                    log.debug('  URL: ' + investigation.url);
                }),
            ({app, investigation}) => ({app, investigation})
        )
}
