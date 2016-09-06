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
            id: 'open-workbook',
            name: 'Open workbook',
            type: 'call',
            value: $ref(`${workbook}.open`)
        }, {
            id: 'fullscreen-workbook',
            name: 'Full screen',
            type: 'toggle',
            value: 0,
            values: $atom([[
                $value(`${workbook}.fullscreen`, $atom(false))
            ], [
                $value(`${workbook}.fullscreen`, $atom(true))
            ]])
        }, {
            id: 'fork-workbook',
            name: 'Copy workbook',
            type: 'call',
            value: $ref(`${workbook}.fork`)
        }, {
            id: 'save-workbook',
            name: 'Save workbook',
            type: 'call',
            value: $ref(`${workbook}.save`)
        }, {
            id: 'embed-workbook',
            name: 'Share workbook',
            type: 'call',
            value: $ref(`${workbook}.embed`)
        }]
    };
}

export function dataset(options, datasetId = simpleflake().toJSON()) {

    const { bg } = options;
    options = {
        type: 'default', scene: 'default',
        mapper: 'default', device: 'default',
        vendor: 'default', controls: 'default',
        id: datasetId, backgroundColor: bg, ... options
    };

    if (!(options.scene in scenes)) {
        options.scene = 'default';
    }

    options.name = options.name || options.dataset;

    const datasetURLOrId = options.dataset || options.url || options.id;

    if (datasetURLOrId) {
        options.url = url.parse(datasetURLOrId);
    }

    return options;
}
