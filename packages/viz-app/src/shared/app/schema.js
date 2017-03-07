import { simpleflake } from 'simpleflakes';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $error, $value } from '@graphistry/falcor-json-graph';

import { Workbook } from 'viz-schema/workbook';

export default withSchema((QL, { get, set }, services) => {

    const { loadWorkbooksById } = services;
    const readWorkbooksByIdHandler = {
        get: get(loadWorkbooksById)
    };
    const readWriteWorkbooksByIdHandler = {
        get: get(loadWorkbooksById),
        set: set(loadWorkbooksById)
    };

    return QL`{
        workbooks: {
            length: ${{
                get: () => $value('workbooks.length', 1)
            }},
            open: ${{ get: getOpenWorkbookReference }}
        },
        workbooksById: {
            [{ keys: workbookIds }]: ${
                Workbook.schema(services)
            }
        }
    }`;
}

function getOpenWorkbookReference(path) {

    const { request = {} } = this;
    const { query: options = {} } = request;
    const { workbook: workbookId = simpleflake().toJSON() } = options;

    this.request = request;
    request.query = options;
    options.workbook = workbookId;

    return $value(`workbooks.open`, $ref(
        `workbooksById['${workbookId}']`, { $expires: 1 }
    ));
}
