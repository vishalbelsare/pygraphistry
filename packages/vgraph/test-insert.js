require('source-map-support').install({ environment:'node' });

const AWS = require('aws-sdk');
const { Observable } = require('rxjs');
const { Client: MapD } = require('rxjs-mapd');
const Cache = require('@graphistry/common/cache');
const { loadVGraph } = require('./lib/cjs/vgraph');
const { convertVGraph } = require('./lib/cjs/csv');
const { createDB, createTable } = require('./lib/cjs/mapd');

const graphistryDir = `/tmp/graphistry`;
const graphistryDataDir = `${graphistryDir}/data_cache`;
const mapdDir = `/Users/ptaylor/graphistry/mapd-core/build`;
const host = `localhost`, port = 9091, encrypted = false;
const username = `mapd`, password = ``, dbName = `mapd`, timeout = 5000;
// const dataset = { name: `BitCoin`, type: `default`, dataset: `bitC` };
// const dataset = { name: `Twitter`, type: `default`, dataset: `Twitter` };
// const dataset = { name: `Biogrid`, type: `default`, dataset: `Biogrid` };
const dataset = { name: `Miserables`, type: `default`, dataset: `Miserables` };
// const dataset = { name: `NetflowHuge`, type: `default`, dataset: `NetflowHuge` };
// const dataset = { name: `NetflowLarge`, type: `default`, dataset: `NetflowLarge` };
// const dataset = { name: `Portscan`, type: `default`, dataset: `PyGraphistry%2FB2O6AYO5OR` };
// const dataset = { name: `PanamaPapers`, type: `jsonMeta`, dataset: `s3://graphistry.data/pygraphistry/c226b1e34fd644ff8d09aaa93c1f2176/dataset.json` };

const metadata = Object.assign({
    discard: false,
    bucket: `graphistry.data`,
    S3: new AWS.S3({ region: `us-west-1` }),
    cache: new Cache(graphistryDataDir, true),
}, dataset);

const printTime = timer();
const nameTok = Date.now();

/*
loadVGraph(metadata)
    .do(({ vgraph }) => printTime(false,
        `nodes: ${vgraph.vertexCount}`,
        `edges: ${vgraph.edgeCount}`,
    )).subscribe({
        next(xs) {
            const { vgraph, nodes, edges } = xs;
            debugger;
        }
    });

const graphistryCsvDir = `${graphistryDir}/csv_cache`;
loadVGraph(metadata)
    .do(() => printTime(false, 'loaded vgraph'))
    .flatMap((opts) => convertVGraph({
        csvDir: graphistryCsvDir + `/${opts.name}_${nameTok}`
    })(opts))
    .do(({ table, csvFilePath }) => printTime(false, `converted and wrote ${table.name} table at ${csvFilePath}`))
    .subscribe({
        error(err) { debugger; printTime(true, `got err`, err); },
        complete() { debugger; printTime(false, 'done'); }
    });
*/

loadVGraph(metadata)
    .do(() => printTime(false, 'loaded vgraph'))
    .map((xs) => Object.assign(xs, { name: dataset.name }))
    .flatMap(
        ({ name, vgraph, edges, nodes }) => createDB({
            mapdDir, dbName: name,
            username: 'graphistry', password: 'graphistry',
            mapdDataDir: `${graphistryDataDir}/${name}_${nameTok}`
        }),
        ({ name, vgraph, edges, nodes }, { username, password, dbName }) => ({
            name, vgraph, edges, nodes, username, password, dbName
        })
    )
    .do(({ dbName }) => printTime(false, `created database ${dbName}`))
    .flatMap(
        ({ name, vgraph, edges, nodes, username, password, dbName }) => MapD
            .open(host, port, encrypted)
            .connect(dbName, username, password, timeout)
            .do(() => printTime(false, `connected to db ${dbName}`)),
        ({ name, vgraph, edges, nodes, username, password, dbName }, client) => ({
            name, vgraph, edges, nodes, dbName, client
        })
    )
    .flatMap(
        ({ name, vgraph, edges, nodes, dbName, client }) => convertVGraph({
            csvDir: `${graphistryDataDir}/${name}_${nameTok}/mapd_import/${client.sessionId}`
        })({ vgraph, edges, nodes }).materialize(),
        ({ name, vgraph, dbName, client }, note) => ({
            name, client, note
        })
    )
    .takeWhile(({ note }) => note.kind !== 'C')
    .flatMap(({ name, client, note }) => note.kind === 'E'
        ? Observable.throw(note.error)
        : Observable.of(Object.assign({ name, client }, note.value))
    )
    .do(({ table, csvFilePath }) => printTime(false, `converted and wrote ${table.name} table at ${csvFilePath}`))
    .concatMap(
        ({ client, table, csvFileName, csvFilePath }) => createTable({ client, table, csvFileName }),
        ({ client, table, csvFileName, csvFilePath }) => table
    )
    .do((table) => printTime(false, `created and inserted ${table.name} table`))
    .subscribe({
        error(err) { debugger; printTime(true, `got err`, err); },
        complete() { debugger; printTime(false, 'done'); }
    });

function timer() {
    const start = process.hrtime();
    return function print(err, ...args) {
        const hrend = process.hrtime(start);
        (err ? console.error : console.log)
            .apply(console, [`%d.%ds:`, hrend[0], hrend[1]/1000000 | 0, ...args]);
    }
}
