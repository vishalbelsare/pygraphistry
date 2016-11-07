import { Observable } from 'rxjs';

import { cache as Cache, logger as commonLogger } from '@graphistry/common';
import { readSelectionCore } from '../simulator/server-viz.js';

const log = commonLogger.createLogger('viz-worker:services:inspector');

//type: 'node' or 'edge'
//sel: {all: true} or box
export function readSelection ({view, type, query}) {

    const { nBody } = view;
    const { dataframe, simulator } = nBody;
    const { sel, page, per_page, sort_by, order, search } = query;

    return Observable
        .bindNodeCallback(readSelectionCore)(
            {dataframe, simulator}, type, query)
        .catch(e => {
            log.error(e, 'readSelection failure');
            return Observable.throw(e);
        });

};