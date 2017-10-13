import _ from 'underscore';
import logger from 'pivot-shared/logger';
import { atomify } from './support';

const log = logger.createLogger(__filename);

const defaults = {
    name: 'Untitled pivot',
    tags: [],
    pivotParameterKeys: [],
    pivotParametersUI: {}
};

export function createTemplateModel(template) {
    const clientFields = ['id', 'name', 'tags', 'pivotParametersUI', 'pivotParameterKeys'];

    const normalizedTemplate = {
        ...defaults,
        ..._.pick(template, clientFields)
    };

    normalizedTemplate.tags = atomify(normalizedTemplate.tags);
    normalizedTemplate.pivotParameterKeys = atomify(normalizedTemplate.pivotParameterKeys);
    normalizedTemplate.pivotParametersUI = atomify(normalizedTemplate.pivotParametersUI);

    return normalizedTemplate;
}
