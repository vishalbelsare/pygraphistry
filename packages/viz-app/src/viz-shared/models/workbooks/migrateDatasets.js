import { dataset as createDataset } from './';

export function migrateDatasets(workbook, options = {}) {

    if (workbook.datasets) {
        return workbook;
    }

    const datasetsList = { length: 0 };
    const workbookDatasets = workbook.datasetReferences;

    for (const datasetId in workbookDatasets) {

        if (!workbookDatasets.hasOwnProperty(datasetId)) {
            continue;
        }

        datasetsList[datasetsList.length++] = createDataset({
            bg: options.bg,
            url: datasetId,
            name: datasetId,
            ... workbookDatasets[datasetId],
        }, dataset.id);
    }

    if (datasetsList.length === 0) {
        datasetsList[datasetsList.length++] = createDataset(options);
    }

    workbook.datasets = datasetsList;

    delete workbook.datasetReferences;

    return workbook;
}

