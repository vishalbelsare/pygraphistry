import { Observable } from 'rxjs';

// Have to hard-code the worker module names instead of specifying them
// dynamically so webpack can statically analyze the `require.ensure` calls.
export function loadWorkerModule(workerName) {
    return Observable.create((subscriber) => {
        if (workerName === 'graph') {
            require.ensure(['viz-worker/index.js'], (require) => {
                subscriber.next(require('viz-worker/index.js').vizWorker);
                subscriber.complete();
            });
        } else if (workerName === 'etl') {
            require.ensure(['etl-worker/index.js'], (require) => {
                subscriber.next(require('etl-worker/index.js').etlWorker);
                subscriber.complete();
            });
        } else if (__DEV__ && workerName === 'doc') {
            require.ensure(['doc-worker/index.js'], (require) => {
                subscriber.next(require('doc-worker/index.js').docWorker);
                subscriber.complete();
            });
        } else {
            subscriber.error(new Error(`Unrecognized worker: ${workerName}.`));
        }
    });
}
