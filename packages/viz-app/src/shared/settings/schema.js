import { Observable } from 'rxjs/Observable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById, setOptionsValue } = services;
    const readSettingsHandler = {
        get: get(loadViewsById)
    };

    return QL`{
        settings: {
            length: ${ readSettingsHandler },
            [{ integers }]: ${ readSettingsHandler }
        },
        options: {
            length: ${ readSettingsHandler },
            [{ integers }]: {
                [{ keys }]: ${ readSettingsHandler }
                ${ !setOptionsValue ? '' : `,
                value: ${{
                    get: get(loadViewsById),
                    set: set(loadViewsById, setOptionsValue(services))
                }}`}
            }
        }
    }`;
});
