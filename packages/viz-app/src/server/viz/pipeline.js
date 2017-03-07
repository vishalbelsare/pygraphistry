import { Observable } from 'rxjs';
import { createLogger } from '@graphistry/common/logger';
const logger = createLogger('viz-app:server:express:pipeline');

function configureVGraphPipeline(config, s3DatasetCache) {
    return function loadAndInitializeVGraph(workbookId, options, services) {

        const workbookIds = [workbookId];
        const { loadWorkbooksById, loadViewsById, maskDataframe, loadVGraph, updateSession } = services;

        return loadWorkbooksById({ workbookIds, options })
            .map(({ workbook }) => workbook.views.current.value.slice(-1))
            .do((viewIds) => logger.info('========> loading views', viewIds))
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
            .let(updateSession({
                status: 'init',
                progress: 100 * 9/10,
                message: 'Loading graph'
            }))
            .mergeMap(({ view }) => {
                const { nBody } = view;
                const { interactionsLoop } = nBody;
                logger.trace('loaded nBody vGraph');
                return interactionsLoop.mapTo(view);
            });
    }
}

export { configureVGraphPipeline };
export default configureVGraphPipeline;

// function updateSession() {
//     return function(source = Observable.of({})) {
//         return source.mergeMap(() => [0], (args) => args);
//     }
// }

// function sendSessionUpdate(sendUpdate, _view, session) {
//     session = session || _view;
//     return function letSendSessionUpdate(source = Observable.of({})) {
//         return source.mergeMap(
//             ({ workbook, view }) => {
//                 _view = view || _view;
//                 _view.session = session;
//                 const workbookPath = workbook ? `workbooksById['${workbook.id}']` : 'workbooks.open';
//                 const viewPath = `${workbookPath}.viewsById['${_view.id}']`;
//                 return sendUpdate({
//                     paths: [`${viewPath}.session['status', 'message', 'progress']`]
//                 }).takeLast(1);
//             },
//             (args) => args
//         );
//     }
// }
