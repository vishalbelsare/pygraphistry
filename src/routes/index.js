import * as workbooks from './workbooks';
import * as workbooksById from './workbooksById';

export function routes(workbooksByIdCache = {}, datasetsByIdCache = {}) {
    return [].concat(
        workbooks.open(workbooksByIdCache),
        workbooksById.views(workbooksByIdCache),
        workbooksById.viewsById(workbooksByIdCache),
        workbooksById.datasets(workbooksByIdCache, datasetsByIdCache),
        workbooksById.datasetsById(workbooksByIdCache, datasetsByIdCache)
    );
}
