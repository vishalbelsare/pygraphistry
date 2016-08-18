import url from 'url';
import { views } from '../../views/model';
import { scenes } from '../../scene/model';
import { simpleflake } from 'simpleflakes';
import { ref as $ref } from 'reaxtor-falcor-json-graph';

export * from './migrateViews';
export * from './migrateDatasets';
export * from './migrateWorkbook';

export function workbook(dataset, workbookId = simpleflake().toJSON()) {
    return {
        id: workbookId,
        title: '',
        contentName: '',
        datasets: { 0: dataset, length: 1 },
        ...views(workbookId)
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
