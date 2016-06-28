import url from 'url';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

export function assignCurrentDataset(options, workbook) {

    const { datasets, datasetsById } = workbook;
    const {
        type = 'default',
        scene = 'default',
        mapper = 'default',
        device = 'default',
        vendor = 'default',
        controls = 'default'
    } = options;

    let datasetName = options.dataset;
    const datasetConfig = { type, scene, mapper, device, vendor, controls };

    let currentDatasetIndex = 0;

    for (const datasetId in datasetsById) {

        if (!datasetsById.hasOwnProperty(datasetId)) {
            continue;
        }

        const dataset = datasetsById[datasetId];

        if (dataset.name === datasetName || datasetName == null) {

            let datasetsIndex = -1;
            const datasetsLen = datasets.length;

            while (++datasetsIndex < datasetsLen) {

                const datasetRef = datasets[datasetsIndex];
                const datasetRefPath = datasetRef.value;

                if (datasetRefPath[datasetRefPath.length - 1] === dataset.id) {

                    currentDatasetIndex = datasetsIndex;

                    datasetName = datasetName || dataset.url || dataset.id;

                    datasetsById[datasetId] = {
                        ... dataset, ... datasetConfig,
                        url: datasetName ? url.parse(datasetName) : undefined
                    };

                    break;
                }
            }
            break;
        }
    }

    datasets.current = $ref(`workbooksById['${workbook.id}'].datasets['${currentDatasetIndex}']`);

    return workbook;
}
