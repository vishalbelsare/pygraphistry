import { Observable } from 'rxjs';

import { vizWorker } from 'viz-worker/index.js';
import { etlWorker } from 'etl-worker/index.js';
// import { docWorker } from 'doc-worker/index.js';

// Keep this call structure so can more easily switch back to deferred require.ensure
export function loadWorkerModule(workerName) {
    return Observable.create((subscriber) => {
        if (workerName === 'graph') {
            subscriber.next(vizWorker);
            subscriber.complete();
        } else if (workerName === 'etl') {
            subscriber.next(etlWorker);
            subscriber.complete();
        // } else if (__DEV__ && workerName === 'doc') {
        //     subscriber.next(docWorker);
        //     subscriber.complete();
        } else {
            subscriber.error(new Error(`Unrecognized worker: ${workerName}.`));
        }
    });
}
