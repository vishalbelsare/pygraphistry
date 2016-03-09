import { createID } from './createID';
import { createView } from './createView';
import { createDataset } from './createDataset';
import { getBlankWorkbookTemplate } from '../../workbook';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

export function createWorkbook(workbookId, options) {

    const workbook = { ... getBlankWorkbookTemplate(), id: workbookId };

    // delete workbook.currentView;
    // delete workbook.datasetReferences;

    const viewsList = { length: 1 };
    const datasetsList = { length: 1 };

    const view = createView(createID());
    const dataset = createDataset(createID(), options);

    viewsList[0] = $ref(`workbooksById['${workbookId}'].viewsById['${view.id}']`);
    datasetsList[0] = $ref(`workbooksById['${workbookId}'].datasetsById['${dataset.id}']`);

    viewsList.current = $ref(`workbooksById['${workbookId}'].views[0]`);
    datasetsList.current = $ref(`workbooksById['${workbookId}'].datasets[0]`);

    workbook.views = viewsList;
    workbook.datasets = datasetsList;

    workbook.viewsById = { [view.id]: view };
    workbook.datasetsById = { [dataset.id]: dataset };

    return workbook;
}
