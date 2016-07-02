import url from 'url';
import { scenes } from './renderer';
import { simpleflake } from 'simpleflakes';

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
