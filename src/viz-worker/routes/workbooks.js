import { partial } from 'lodash';
import { Observable } from 'rxjs/Observable';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

import 'rxjs/add/observable/of';

import { createID } from './support/createID';
import { loadWorkbook } from './support/loadWorkbook';
import { createWorkbook } from './support/createWorkbook';
import { assignCurrentDataset } from './support/assignCurrentDataset';

export function open(workbooksById) {
    return [{
        route: `workbooks['open']`,
        call(callPath, [options]) {

            const { workbookDoc } = this.server;

            let workbookObs;

            if (options.workbook) {
                workbookObs = loadWorkbook(workbooksById, options.workbook, options);
            } else {
                const workbook = createWorkbook(createID(), options);
                workbooksById[workbook.id] = workbook;
                workbookObs = Observable.of(workbook);
            }

            return workbookObs
                .map(partial(assignCurrentDataset, options))
                .do((workbook) => workbookDoc.next(workbook))
                .map((workbook) => {
                    const ref = $ref(`workbooksById['${workbook.id}']`);
                    const path = `workbooks['open']`;
                    return $pathValue(path, ref);
                });
        }
    }];
}
