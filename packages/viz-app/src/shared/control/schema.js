import { Observable } from 'rxjs/Observable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readWriteControlHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById)
    };

    return QL`{
        ['id', 'name', 'selected']: ${
            readWriteControlHandler
        }
    }`;
});
