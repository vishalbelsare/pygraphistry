import * as fs from 'fs';
import * as os from 'os';
import * as Pbf from 'pbf';
import * as path from 'path';

import { VectorMetadata } from './partition';
import { fork, ChildProcess, ForkOptions } from 'child_process';

const workerPath = path.resolve(require.resolve('./worker'));

export interface RunnerOptions extends ForkOptions {
    fileDir: string;
    workers?: number;
}

export function runner(options: RunnerOptions) {
    const numWorkers = options.workers || os.cpus().length;
    return function runWorkers(vectors: VectorMetadata[]) {};
}
