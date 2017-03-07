import { Observable } from 'rxjs/Observable';
import { Control } from '../control';
import { Settings } from '../settings';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readLayoutHandler = {
        get: get(loadViewsById)
    };

    return QL`{
        ['id', 'name', 'length']: ${
            readLayoutHandler
        },
        controls: {
            [{ keys }]: ${
                Control.schema(services)
            }
        },
        ...${ Settings.schema({
            ...services, setOptionsValue: layoutOptionValuesSetRoute
        })}
    }`;
});

function layoutOptionValuesSetRoute({ setLayoutControlById }) {
    return function layoutOptionValuesSetHandler(
        control, key, value, path, { workbook, view }
    ) {
        const { id, props: { algoName }} = control;
        return setLayoutControlById({
            id,
            value, algoName,
            viewId: view.id,
            workbookId: workbook.id
        })
        .mergeMapTo(Observable.of(
            $value(path, control[key] = value)
        ));
    }
}
