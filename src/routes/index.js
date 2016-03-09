import * as workbooks from './workbooks';
import * as workbooksById from './workbooksById';
import * as datasetsById from './datasetsById';

export function routes(workbooksByIdCache = {}, datasetsByIdCache = {}) {
    return [].concat(
        workbooks.open(workbooksByIdCache),

        workbooksById.views(workbooksByIdCache),
        workbooksById.viewsById(workbooksByIdCache),
        workbooksById.datasets(workbooksByIdCache, datasetsByIdCache),

        datasetsById.renderer(datasetsByIdCache)
    );
}
