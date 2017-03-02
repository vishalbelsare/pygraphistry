import { Observable } from 'rxjs';
import { simpleflake } from 'simpleflakes';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value } from '@graphistry/falcor-json-graph';

export function workbooks(path, base) {
    return function workbooks({ loadWorkbooksById, saveWorkbook }) {
        const workbook = `${base}['workbooksById'][{keys}]`;
        const getValues = getHandler(path.concat('workbook'), loadWorkbooksById);
        const setValues = setHandler(path.concat('workbook'), loadWorkbooksById);

        return [{
            get: getWorkbooksLength,
            route: `${base}['workbooks'].length`,
            returns: `Number`
        }, {
            get: getOpenWorkbookReference,
            route: `${base}['workbooks'].open`,
            returns: `$ref('workbooksById[{workbookId}]')`
        }, {
            get: getValues,
            route: `${workbook}['id', 'title', 'fullscreen', 'contentName']`
        }, {
            get: getValues,
            route: `${workbook}['views'][{keys}]`
        }, {
            get: getValues,
            route: `${workbook}['controls'][{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${workbook}['controls'][{keys}][{keys}]`
        }, {
            call: openWorkbook,
            route: `${workbook}.open`
        }, {
            call: forkWorkbook,
            route: `${workbook}.fork`
        }, {
            call: saveWorkbookRoute,
            route: `${workbook}.save`
        }, {
            call: embedWorkbook,
            route: `${workbook}.embed`
        }];

        function getWorkbooksLength(path) {
            return [
                $value(`workbooks.length`, 1)
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
            .map(({ workbook }) => $value(
                `workbooks.open`, $ref(
                    `workbooksById['${workbookId}']`, { $expires: 1 })
            ));
        }

        function openWorkbook(path, args) {
            return [];
        }

        function forkWorkbook(path, args) {
            return [];
        }

        function saveWorkbookRoute(path, args) {
            const workbookIds = path[1];

            return loadWorkbooksById({workbookIds})
                .mergeMap(saveWorkbook)
                .mergeMapTo(Observable.empty());
        }

        function embedWorkbook(path, args) {
            return [];
        }

    }
}
