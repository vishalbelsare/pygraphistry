import {
    ref as $ref,
    error as $error,
    pathValue as $pathValue
} from 'falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { getHandler, captureErrorStacks } from '../support';

export function workbooks({ loadWorkbooksById }, routesSharedState) {

    const genericGetHandler = getHandler(['workbook'], loadWorkbooksById, routesSharedState);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .views[{keys}]`
    }, {
        get: getOpenWorkbookReference,
        route: `workbooks.open`
    }]

    function getOpenWorkbookReference(path) {
        const { request = {} } = this;
        const { cookies = {}, query = {} } = request;
        const options = { ...cookies, ...query };
        const { workbook: workbookId = simpleflake().toJSON() } = options;
        const workbookIds = [workbookId];

        this.request = request;
        request.query = options;
        options.workbook = workbookId;

        return loadWorkbooksById({
            ...routesSharedState, workbookIds, options
        })
        .map(({ workbook }) => $pathValue(
            `workbooks.open`, $ref(`workbooksById['${workbookId}']`)
        ))
        .catch(captureErrorStacks);
    }
}
