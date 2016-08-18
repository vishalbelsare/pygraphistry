import {
    ref as $ref,
    error as $error,
    pathValue as $pathValue
} from 'reaxtor-falcor-json-graph';

import { simpleflake } from 'simpleflakes';
import { getHandler, captureErrorStacks } from '../routes';

export function workbooks({ loadWorkbooksById }) {

    const getValues = getHandler(['workbook'], loadWorkbooksById);

    return [{
        get: getWorkbooksLength,
        route: `workbooks.length`,
        returns: `Number`
    }, {
        get: getOpenWorkbookReference,
        route: `workbooks.open`,
        returns: `$ref('workbooksById[{workbookId}]')`
    }, {
        get: getValues,
        route: `workbooksById[{keys}].views.length`,
        returns: `Number`
    }, {
        get: getValues,
        route: `workbooksById[{keys}].views.current`,
        returns: `ref('workbooksById[{workbookId}].views[{currentViewIndex}]')`
    }, {
        get: getValues,
        route: `workbooksById[{keys}].views[{integers}]`,
        returns: `ref('workbooksById[{workbookId}].viewsById[{viewId}]')`
    }];

    function getWorkbooksLength(path) {
        return [
            $pathValue(`workbooks.length`, 1)
        ];
    }

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
