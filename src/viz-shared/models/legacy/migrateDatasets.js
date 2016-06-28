import flake from 'simpleflake';
import { dataset as createDataset } from '../dataset';

export function migrateDatasets(workbook) {

    if (workbook.datasets) {
        return workbook;
    }

    const datasets = [];
    const workbookDatasets = workbook.datasetReferences;

    for (const datasetId in workbookDatasets) {

        if (!workbookDatasets.hasOwnProperty(datasetId)) {
            continue;
        }

        datasets.push(createDataset({
            url: datasetId, name: datasetId,
            ... workbookDatasets[datasetId]
        }, dataset.id));
    }

    workbook.datasets = datasets;
    delete workbook.datasetReferences;

    return workbook;
}

