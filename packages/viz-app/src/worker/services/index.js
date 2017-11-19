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
export * from './inspector';

import { Observable } from 'rxjs';
import { loadLabels } from './labels';
import { loadVGraph } from './vgraph';
import { filterRows } from './inspector';
import { loadViews, moveSelectedNodes } from './views';
import { loadWorkbooks, saveWorkbookService } from './workbooks';
import { sendFalcorUpdate } from './sendFalcorUpdate';
import { loadNBody, setLayoutControl } from './nBody';
import {
    setEncoding,
    getEncoding,
    getEncodingOptions,
    setDefaultEncoding,
    getDefaultEncoding
} from './encodings';
import { loadRows, appendColumn, maskDataframe, tickLayout } from './dataframe';
import {
    addHistogram,
    removeHistogram,
    loadHistograms,
    loadSelectionHistograms,
    computeMaskForHistogramBin
} from './histograms';
import { addExpression, updateExpression, removeExpression } from './expressions';

function services({ config, s3WorkbookCache = {}, nBodiesById = {}, workbooksById = {} }) {
    const loadConfig = () => Observable.of(config);
    const loadDatasetNBody = loadNBody(nBodiesById);
    const loadWorkbooksById = loadWorkbooks(workbooksById, config, s3WorkbookCache);
    const saveWorkbook = saveWorkbookService(config, s3WorkbookCache);

    const loadViewsById = loadViews(loadDatasetNBody, loadWorkbooksById);
    const loadVGraphImpl = loadVGraph(setEncoding, setDefaultEncoding);
    const moveSelectedNodesImpl = moveSelectedNodes(loadViewsById);
    const loadHistogramsById = loadHistograms(loadViewsById);
    const loadLabelsByIndexAndType = loadLabels(loadViewsById);
    const setLayoutControlById = setLayoutControl(loadViewsById);
    const filterRowsByQuery = filterRows(loadViewsById);
    const loadRowsByIndexAndType = loadRows(loadViewsById);
    const loadSelectionHistogramsById = loadSelectionHistograms(loadViewsById);

    const addExpressionImpl = addExpression(loadViewsById);
    const removeExpressionById = removeExpression(loadViewsById);
    const updateExpressionById = updateExpression(loadViewsById);

    const addHistogramImpl = addHistogram(loadViewsById);
    const removeHistogramById = removeHistogram(loadViewsById);

    return {
        loadConfig,
        loadVGraph: loadVGraphImpl,
        loadViewsById,
        sendFalcorUpdate,
        loadWorkbooksById,

        saveWorkbook,
        filterRowsByQuery,
        loadHistogramsById,
        loadRowsByIndexAndType,
        loadLabelsByIndexAndType,
        loadSelectionHistogramsById,

        setEncoding,
        getEncoding,
        getEncodingOptions,
        setDefaultEncoding,
        getDefaultEncoding,

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

export { services };
export default services;
