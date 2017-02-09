import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import { DataFrame } from 'dataframe-js';
import _ from 'underscore';
import zlib from 'zlib';
import request from 'request';
import VError from 'verror';

import logger from '../../shared/logger.js';
const log = logger.createLogger(__filename);


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
            .do((res) => log.debug({res}, 'ETL success'))
            .map(() => data.name)
            .catch((err) => Observable.throw(new VError(err, 'ETL upload error')))
    );
}

//jsonGraph * (err? -> ())? -> ()
function upload0(etlService, apiKey, data, _cb) {
    // When called with Observable.bindNodeCallback, cb will be defined and the following
    // default function will not be used.
    const cb = _cb || function (err, res) {
        if (err) {
            return new VError(err, 'ETL upload error');
        } else {
            return log.debug(res, 'ETL success');
        }
    };

    const headers = {'Content-Encoding': 'gzip', 'Content-Type': 'application/json'};
    return request.post({
        uri: etlService,
        qs: getQuery(apiKey),
        headers: headers,
        body: data,
        callback: function (err, res, body) {
            if (err) {
                return cb(err);
            }
            log.debug('Response status', res.statusCode, res.statusMessage);
            if (res.statusCode >= 400) {
                return cb(new Error(
                    `ETL service responded with ${res.statusCode} (${res.statusMessage})`
                ));
            }
            try {
                log.debug('Trying to parse response body', body)
                const json = JSON.parse(body);
                if (!json.success) {
                    log.debug({body: body}, 'Server Response');
                    return cb(new Error(`Server responded with success=false: ${json.msg}`));
                }
                return cb(undefined, json);
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

    const uploadData = {
        graph: mergedPivots.graph,
        labels: mergedPivots.labels,
        name, type, bindings
    };

    return { pivots, data:uploadData };
}

function makeEventTable({pivots}) {
    function fieldSummary(mergedData, field) {

        const distinct = mergedData.distinct(field).toArray();

        const res = {
            numDistinct: distinct.length
        };

        if (res.numDistinct <= 12) {
            res.values = distinct;
        }

        return res;
    }

    const dataFrames = pivots
        .filter(pivot => (pivot.results && pivot.enabled))
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

    const fieldSummaries = {};

    fields.forEach(field => {
        fieldSummaries[field] = fieldSummary(mergedData, field)
    });

    const table = mergedData.groupBy('EventID')
        .aggregate((group) => group.toCollection()[0])
        .toArray('aggregation');

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
                        .map(({ pivot }) => pivot)
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
                        investigation.status = {
                            ok: true,
                            etling: false,
                            msgStyle: 'default'
                        };
                    } else {
                        investigation.status = {
                            ok: false,
                            etling: false,
                            message: 'No events found!',
                            msgStyle: 'info',
                        }
                    }
                    log.debug('  URL: ' + investigation.url);
                }),
            ({app, investigation}) => ({app, investigation})
        )
}
