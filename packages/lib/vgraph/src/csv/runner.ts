import * as fs from 'fs';
import * as os from 'os';
import * as net from 'net';
import * as path from 'path';
import * as csv from 'fast-csv';
import * as mkdirp from 'mkdirp';
import { Writer } from 'protobufjs';
import * as shm from 'shm-typed-array';
import { VectorGraph } from '../vgraph';
import { VGraphTable } from './partition';
import { Observable, Scheduler } from 'rxjs';
import { fork, ChildProcess, ForkOptions } from 'child_process';

type FDAndWorkers = { csvFd: fs.WriteStream; workers: ChildProcess[] };

export interface ShmBuffer extends Buffer {
    key: number;
}
export interface RunnerOptions extends ForkOptions {
    csvDir: string;
    workers?: number;
}

const workerPath = path.resolve(require.resolve('./worker'));

function forkWorkers(workers, opts) {
    return Array.from({ length: workers }, (x, i) =>
        fork(workerPath, ['' + i], { execArgv: [], ...opts })
    );
}

class ShmWriter extends Writer {
    static create() {
        return new ShmWriter();
    }
    static alloc(size: number) {
        return size < 1 ? Writer.alloc(size) : shm.create(size, 'Uint8Array', null);
    }
}

export function runner(opts: RunnerOptions) {
    const csvDir = path.resolve(opts.csvDir);
    const numWorkers = opts.workers || os.cpus().length;

    return function runWorkers(table: VGraphTable) {
        const csvFileName = `${table.name}.csv`;
        const csvFilePath = path.join(csvDir, `./${csvFileName}`);
        const rowsBatchCount = Math.ceil(table.length / numWorkers);
        // const rowsBatchCount = Math.min(20000, Math.ceil(table.length / numWorkers));
        return Observable.bindNodeCallback(<Function>mkdirp)(csvDir)
            .map(() => fs.createWriteStream(csvFilePath, { encoding: 'utf8' }))
            .flatMap(csvFd => Observable.fromEvent(csvFd, 'open', () => csvFd))
            .flatMap(writeCSVHeader(table))
            .flatMap(convertAndWriteCSVRows(table, numWorkers, rowsBatchCount))
            .do(csvFd => csvFd.end())
            .mapTo({ table, csvFileName, csvFilePath })
            .take(1);
    };
}

function writeCSVHeader(table) {
    return function writeHeader(csvFd: fs.WriteStream): Observable<fs.WriteStream> {
        return Observable.bindNodeCallback(csvFd.write, () => csvFd).bind(csvFd)(
            [
                ...(table.bool_vectors || []),
                ...(table.float_vectors || []),
                ...(table.int32_vectors || []),
                ...(table.int64_vectors || []),
                ...(table.double_vectors || []),
                ...(table.string_vectors || []),
                ...(table.uint32_vectors || [])
            ]
                .map(({ name }) => name)
                .join(',') + '\n'
        );
    };
}

function convertAndWriteCSVRows(table, numWorkers, rowsBatchCount) {
    return function convertAndWriteRows(csvFd: fs.WriteStream) {
        return Observable.of({ start: 0, total: table.length })
            .expand(
                ({ start, total }) =>
                    start >= total
                        ? Observable.empty()
                        : Observable.forkJoin(
                              ...(forkWorkers(numWorkers, {
                                  stdio: ['ignore', 'inherit', 'inherit', 'ipc', csvFd]
                              }).map(convertSlice.bind(null, start, total)) as Observable<number>[])
                          ).map(() => ({ total, start: start + rowsBatchCount * numWorkers }))
            )
            .takeLast(1)
            .mapTo(csvFd);

        function convertSlice(start, total, worker, index) {
            let convertObs;
            const idx1 = Math.min(total, start + rowsBatchCount * index);
            const idx2 = Math.min(total, start + rowsBatchCount * (index + 1));

            if (idx2 - idx1 <= 0) {
                convertObs = Observable.of(0);
            } else {
                const sliceVals = vec => ({ ...vec, values: vec.values.slice(idx1, idx2) });
                const vBuf = VectorGraph.encode(
                    {
                        ...table,
                        bool_vectors: table.bool_vectors.map(sliceVals),
                        float_vectors: table.float_vectors.map(sliceVals),
                        int32_vectors: table.int32_vectors.map(sliceVals),
                        int64_vectors: table.int64_vectors.map(sliceVals),
                        double_vectors: table.double_vectors.map(sliceVals),
                        string_vectors: table.string_vectors.map(sliceVals),
                        uint32_vectors: table.uint32_vectors.map(sliceVals)
                    },
                    ShmWriter.create()
                ).finish() as ShmBuffer;

                const key = vBuf.key || -1;
                const messages = Observable.fromEvent(worker, 'message');
                const detach = messages
                    .filter(({ type }) => type === 'decoded')
                    .do(() => shm.detach(key, true))
                    .take(1)
                    .ignoreElements();
                const done = Observable.fromEvent(worker, 'message')
                    .filter(({ type }) => type === 'done')
                    .pluck('rows');

                convertObs = Observable.if(
                    () => key < 0,
                    Observable.of(0),
                    Observable.bindNodeCallback(worker.send).bind(worker)({ type: 'data', key })
                        .subscribeOn(Scheduler.async, 100)
                        .publish(xs => detach.merge(xs.flatMapTo(done)))
                        .take(1)
                );
            }

            return convertObs.delay(100).do(() => worker.kill());
        }
    };
}
