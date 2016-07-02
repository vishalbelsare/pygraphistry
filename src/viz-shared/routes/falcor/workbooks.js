import {
    ref as $ref,
    error as $error,
    pathValue as $pathValue
} from 'falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { getHandler, captureErrorStacks } from '../support';

export function workbooks({ loadWorkbooksById }) {

    const genericGetHandler = getHandler(['workbook'], loadWorkbooksById);

    return [{
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .views['current']`,
        returns: `ref('workbooksById[{workbookId}].views[{integer}]')`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .views[{integers}]`,
        returns: `ref('workbooksById[{workbookId}].viewsById[{viewId}]')`
    }, {
        get: genericGetHandler,
        route: `workbooksById[{keys}]
                    .views['length']`,
        returns: `Number`
    }, {
        get: getOpenWorkbookReference,
        route: `workbooks.open`,
        returns: `$ref('workbooksById[{workbookId}]')`
    }]

    function getOpenWorkbookReference(path) {

        const { request = {} } = this;
        const { query: options = {} } = request;
        const { workbook: workbookId = simpleflake().toJSON() } = options;
        const workbookIds = [workbookId];

        this.request = request;
        request.query = options;
        options.workbook = workbookId;

        return loadWorkbooksById({
            workbookIds, options
        })
        .map(({ workbook }) => $pathValue(
            `workbooks.open`, $ref(`workbooksById['${workbookId}']`)
        ))
        .catch(captureErrorStacks);
    }
}
