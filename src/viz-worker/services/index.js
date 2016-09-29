export * from './views';
export * from './nBody';
export * from './labels';
export * from './vgraph';
export * from './datasets';
export * from './workbooks';
export * from './dataframe';
export * from './expressions';
export * from './sendFalcorUpdate';

import { Observable } from 'rxjs';
import { loadViews } from './views';
import { loadLabels } from './labels';
import { loadVGraph } from './vgraph';
import { loadWorkbooks } from './workbooks';
import { maskDataframe } from './dataframe';
import { sendFalcorUpdate } from './sendFalcorUpdate';
import { loadNBody, setLayoutControl } from './nBody';
import { addExpression, updateExpression, removeExpression } from './expressions';

export function services({ config, s3Cache, nBodiesById, workbooksById }) {

    const loadConfig = () => Observable.of(config);
    const loadDatasetNBody = loadNBody(nBodiesById, config, s3Cache);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3Cache);

    const loadViewsById = loadViews(loadDatasetNBody, loadWorkbooksById);
    const loadLabelsByIndexAndType = loadLabels(loadViewsById);
    const setLayoutControlById = setLayoutControl(loadViewsById);

    const addExpressionImpl = addExpression(loadViewsById);
    const removeExpressionById = removeExpression(loadViewsById);
    const updateExpressionById = updateExpression(loadViewsById);

    return {

        loadConfig,
        loadVGraph,
        loadViewsById,
        sendFalcorUpdate,
        loadWorkbooksById,
        loadLabelsByIndexAndType,

        loadDatasetNBody,
        setLayoutControlById,

        maskDataframe,
        updateExpressionById,
        removeExpressionById,
        addExpression: addExpressionImpl,
    };
}
