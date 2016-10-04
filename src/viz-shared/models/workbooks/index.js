import url from 'url';
import { views } from '../views';
import { scenes } from '../scene';
import { simpleflake } from 'simpleflakes';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';

export * from './migrateViews';
export * from './migrateDatasets';
export * from './migrateWorkbook';

export function workbook(dataset, workbookId = simpleflake().toJSON()) {
    const workbook = `workbooksById['${workbookId}']`;
    return {

        id: workbookId, title: '',
        contentName: '', fullscreen: false,
        datasets: { 0: dataset, length: 1 },

        ...views(workbookId),

        controls: [{
            selected: false,
            workbook: $ref(`${workbook}`),
            id: 'open-workbook',
            name: 'Open workbook',
        }, {
            selected: false,
            workbook: $ref(`${workbook}`),
            id: 'fullscreen-workbook',
            name: 'Full screen',
        }, {
            selected: false,
            workbook: $ref(`${workbook}`),
            id: 'fork-workbook',
            name: 'Copy workbook',
        }, {
            selected: false,
            workbook: $ref(`${workbook}`),
            id: 'save-workbook',
            name: 'Save workbook',
        }, {
            selected: false,
            workbook: $ref(`${workbook}`),
            id: 'embed-workbook',
            name: 'Share workbook',
        }]
    };
}

export function dataset(options, datasetId = simpleflake().toJSON()) {

    options = {
        type: 'default', scene: 'default',
        mapper: 'default', device: 'default',
        vendor: 'default', controls: 'default',
        id: datasetId, ...options
    };

    if (!(options.scene in scenes)) {
        options.scene = 'default';
    }

    options.name = options.name || options.dataset;

    const datasetURLOrId = (options.dataset &&
         decodeURIComponent(options.dataset)) ||
         options.url || options.id;

    if (datasetURLOrId) {
        options.url = url.parse(datasetURLOrId);
    }

    return options;
}
