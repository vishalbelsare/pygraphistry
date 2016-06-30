import url from 'url';
import { simpleflake } from 'simpleflakes';
import { scenes } from './renderer';

export function dataset(options, datasetId = simpleflake().toJSON()) {

    options = {
        type: 'default', scene: 'default',
        mapper: 'default', device: 'default',
        vendor: 'default', controls: 'default',
        id: datasetId, ... options
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
