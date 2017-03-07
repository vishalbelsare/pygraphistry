import { Observable } from 'rxjs/Observable';
import { Control } from '../control';
import { Settings } from '../settings';
import { Renderer } from '../renderer';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $ref, $value, $invalidate } from '@graphistry/falcor-json-graph';

export default withSchema((QL, { get, set }, services) => {

    const { loadViewsById } = services;
    const readSceneHandler = {
        get: get(loadViewsById)
    };
    const readWriteSceneSimulatingHandler = {
        get: get(loadViewsById),
        set: set(loadViewsById, simulatingSetRoute(services))
    };

    return QL`{
        [{ keys }]: ${ readSceneHandler },
        renderer: ${ Renderer.schema(services) },
        simulating: ${ readWriteSceneSimulatingHandler },
        controls: {
            [{ keys }]: ${
                Control.schema(services)
            }
        },
        ...${ Settings.schema({
            ...services, setOptionsValue: null
        })}
    }`;
});

function simulatingSetRoute(services) {
    const { tickLayout } = services;
    return function simulatingSetHandler(scene, key, simulating, path, { view }) {
        return tickLayout({ view }).concat(Observable.of({
            path, value: scene[key] = simulating
        }));
    }
}
