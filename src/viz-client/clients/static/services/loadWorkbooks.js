import { loadResource } from './loadResource';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { dataset as createDataset,
         workbook as createWorkbook } from '../../../../viz-shared/models';

export function loadWorkbooks(workbooksById) {
    const loadWorkbookById = loadWorkbook(workbooksById);
    return function loadWorkbooksById({ workbookIds, options = {} }) {
        return Observable
            .from(workbookIds)
            .mergeMap(
                (workbookId) => loadWorkbookById({ workbookId, options }),
                (workbookId, workbook) => ({ workbook })
            );
    }
}

export function loadWorkbook(workbooksById) {
    return function loadWorkbookById({ workbookId, options = {} }) {
        return (workbookId in workbooksById) ?
            workbooksById[workbookId] : (
            workbooksById[workbookId] = Observable
                .zip(downloadMetadata(options), downloadScene(options))
                .map(([metadata, scene]) => createWorkbook(createDataset({
                    ...options, ...metadata, scene
                }), workbookId))
                .concat(Observable.never())
                .multicast(new ReplaySubject(1))
                .refCount()
            );
    }
}

function downloadMetadata({ contentKey = '' }) {
    return loadResource('metadata.json', { contentKey })
        .map(({ response }) => response)
        .catch(() => Observable.of({}));
}

function downloadScene({ contentKey = '' }) {
    return loadResource('renderconfig.json', { contentKey })
        .map(({ response }) => response)
        .catch((error) => {
            console.error('Error retrieving render config.', error);
            throw new Error('Content Not Found');
        });
}
