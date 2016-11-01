export * from './views';
export * from './nBody';
export * from './labels';
export * from './vgraph';
export * from './datasets';
export * from './workbooks';
export * from './dataframe';
export * from './histograms';
export * from './expressions';
export * from './sendFalcorUpdate';

import { Observable } from 'rxjs';
import { loadLabels } from './labels';
import { loadVGraph } from './vgraph';
import { appendColumn, maskDataframe, tickLayout } from './dataframe';
import { loadViews, moveSelectedNodes } from './views';
import { loadWorkbooks, saveWorkbookService } from './workbooks';
import { sendFalcorUpdate } from './sendFalcorUpdate';
import { loadNBody, setLayoutControl } from './nBody';
import {
    addHistogram, removeHistogram,
    loadHistograms, loadSelectionHistograms,
    computeMaskForHistogramBin
} from './histograms';
import { addExpression, updateExpression, removeExpression } from './expressions';

export function services({ config, s3WorkbookCache, nBodiesById, workbooksById }) {

    const loadConfig = () => Observable.of(config);
    const loadDatasetNBody = loadNBody(nBodiesById);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3WorkbookCache);
    const saveWorkbook = saveWorkbookService(config, s3WorkbookCache);

    const loadViewsById = loadViews(loadDatasetNBody, loadWorkbooksById);
    const moveSelectedNodesImpl = moveSelectedNodes(loadViewsById);
    const loadHistogramsById = loadHistograms(loadViewsById);
    const loadLabelsByIndexAndType = loadLabels(loadViewsById);
    const setLayoutControlById = setLayoutControl(loadViewsById);
    const loadSelectionHistogramsById = loadSelectionHistograms(loadViewsById);

    const addExpressionImpl = addExpression(loadViewsById);
    const removeExpressionById = removeExpression(loadViewsById);
    const updateExpressionById = updateExpression(loadViewsById);

    const addHistogramImpl = addHistogram(loadViewsById);
    const removeHistogramById = removeHistogram(loadViewsById);

    return {
        loadConfig,
        loadVGraph,
        loadViewsById,
        sendFalcorUpdate,
        loadWorkbooksById,

        saveWorkbook,
        loadHistogramsById,
        loadLabelsByIndexAndType,
        loadSelectionHistogramsById,

        moveSelectedNodes: moveSelectedNodesImpl,

        loadDatasetNBody,
        setLayoutControlById,

        appendColumn,
        tickLayout,
        maskDataframe,
        updateExpressionById,
        removeExpressionById,
        addExpression: addExpressionImpl,

        removeHistogramById,
        addHistogram: addHistogramImpl,
        computeMaskForHistogramBin
    };
}
