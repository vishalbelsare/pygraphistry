import Color from 'color';
import { Control } from 'viz-schema/Control';
import { Settings } from 'viz-schema/Settings';
import { Observable } from 'rxjs/Observable';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readLabelsHandler = {
        get: get(loadViewsById)
    };
    const readWriteLabelsHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById)
    };
    const readWriteLabelColorsHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById, labelColorsSetRoute(services))
    };

    return QL`{
        ['renderer', 'highlight', 'selection', 'encodings']: ${
            readWriteLabelsHandler
        },
        ['id', 'name', 'opacity', 'enabled', 'poiEnabled', 'timeZone']: ${
            readWriteLabelsHandler
        },
        ['background', 'foreground']: {
            [{ keys }]: ${
                readWriteLabelColorsHandler
            }
        },
        ['edge', 'point']: {
            ['length', { integers }]: ${
                readWriteLabelsHandler
            }
        },
        ...${Settings.schema({
            ...services, setOptionsValue: null
        })}
    }`;
});

function labelColorsSetRoute(services) {
    return function labelColorsSetHandler(node, key, value, path, { view }) {
        return $value(path, node[key] = new Color(color));
    }
}
