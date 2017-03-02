import { View } from 'viz-schema/view';
import { Observable } from 'rxjs/Observable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $error, $value } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadWorkbooksById } = services;
    const readWorkbooksByIdHandler = {
        get: get(loadWorkbooksById)
    };
    const readWriteWorkbooksByIdHandler = {
        get: get(loadWorkbooksById),
        set: set(loadWorkbooksById)
    };

    const saveWorkbookHandler = { call: saveWorkbookCallRoute(services) };
    const forkWorkbookHandler = { call: forkWorkbookCallRoute(services) };
    const embedWorkbookHandler = { call: embedWorkbookCallRoute(services) };

    return QL`{
        ['id', 'title', 'fullscreen', 'contentName']: ${
            readWorkbooksByIdHandler
        },
        save: ${ saveWorkbookHandler },
        fork: ${ forkWorkbookHandler },
        embed: ${ embedWorkbookHandler },
        ['views', 'controls']: {
            [{ keys }]: ${
                readWorkbooksByIdHandler
            }
        },
        controls: {
            [{ keys }]: {
                [{ keys }]: ${
                    readWriteWorkbooksByIdHandler
                }
            }
        },
        viewsById: {
            [{ keys: viewIds }]: ${
                View.schema(services)
            }
        }
    }`;
}

function saveWorkbookCallRoute({ saveWorkbook, loadWorkbooksById }) {
    return function saveWorkbookCallHandler({ workbookIds }) {
        return loadWorkbooksById({ workbookIds })
            .mergeMap(saveWorkbook)
            .startWith(...[
                $value(`progress`, 0),
                $value(`status`, 'info'),
                $value(`message`, 'Saving workbook...')
            ])
            .concat(Observable.of(
                $value(`progress`, 100),
                $value(`status`, 'success'),
                $value(`message`, 'Saved workbook')
            ))
            .catch(() => Observable.of(
                $value(`progress`, 0),
                $value(`status`, 'error'),
                $value(`message`, 'Failed to save workbook')
            ))
    }
}

// Todo: implement these
function forkWorkbookCallRoute({ loadWorkbooksById }) {
    return [];
}

// Todo: implement these
function embedWorkbookCallRoute({ loadWorkbooksById }) {
    return [];
}
