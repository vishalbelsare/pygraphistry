import { loadResource } from './resource';
import { Observable, ReplaySubject } from 'rxjs';
import { dataset as createDataset, workbook as createWorkbook } from 'viz-app/models/workbooks';

export function loadWorkbooks(workbooksById) {
  const loadWorkbookById = loadWorkbook(workbooksById);
  return function loadWorkbooksById({ workbookIds, options = {} }) {
    return Observable.from(workbookIds).mergeMap(
      workbookId => loadWorkbookById({ workbookId, options }),
      (workbookId, workbook) => ({ workbook })
    );
  };
}

export function loadWorkbook(workbooksById) {
  return function loadWorkbookById({ workbookId, options = {} }) {
    return workbookId in workbooksById
      ? workbooksById[workbookId]
      : (workbooksById[workbookId] = downloadMetadata(options)
          .map(metadata =>
            createWorkbook(
              createDataset({
                ...options,
                ...metadata
              }),
              workbookId
            )
          )
          .multicast(new ReplaySubject(1))
          .refCount());
  };
}

function downloadMetadata({ contentKey = '' }) {
  return loadResource('metadata.json', { contentKey })
    .map(({ response }) => response)
    .catch(() => Observable.of({}));
}
