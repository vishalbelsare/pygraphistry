import { Observable } from 'rxjs';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:express:pipeline');

function configureVGraphPipeline(config, s3DatasetCache) {
    return function loadAndInitializeVGraph(workbookId, options, services) {

        const workbookIds = [workbookId];
        const { loadWorkbooksById, loadViewsById, maskDataframe, loadVGraph, updateSession } = services;

        return loadWorkbooksById({ workbookIds, options })
            .map(({ workbook }) => workbook.views.current.value.slice(-1))
            .mergeMap((viewIds) => loadViewsById({ workbookIds, viewIds, options }))
            .mergeMap(
                ({ workbook, view }) => loadVGraph(view, config, s3DatasetCache, updateSession),
                ({ workbook, view }) => ({ workbook, view })
            )
            .let(updateSession({
                status: 'init',
                progress: 100 * 8/10,
                message: 'Applying filters'
            }))
            .mergeMap(
                ({ workbook, view }) => maskDataframe({ view }),
                ({ workbook }, { view }) => ({ workbook, view })
            )
            .mergeMap(({ workbook, view }) => {
                const { nBody } = view;
                const { interactionsLoop } = nBody;
                logger.trace('loaded nBody vGraph');
                return interactionsLoop.mapTo({ workbook, view });
            });
    }
}

export { configureVGraphPipeline };
export default configureVGraphPipeline;
