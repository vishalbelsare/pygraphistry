export * from './views';
export * from './config';
export * from './labels';
export * from './resource';
export * from './workbooks';

import { loadViews } from './views';
import { loadConfig } from './config';
import { loadLabels } from './labels';
import { loadResource } from './resource';
import { loadWorkbooks } from './workbooks';

export function services({ workbooksById = {}, labelsByIndex = {}, labelOffsetsByType = {} } = {}) {
    const loadWorkbooksById = loadWorkbooks(workbooksById);
    const loadViewsById = loadViews(loadWorkbooksById);
    const loadLabelsByIndexAndType = loadLabels(loadViewsById, labelsByIndex, labelOffsetsByType);

    return {
        loadConfig,
        loadResource,
        loadViewsById,
        loadWorkbooksById,
        loadLabelsByIndexAndType
    };
}
