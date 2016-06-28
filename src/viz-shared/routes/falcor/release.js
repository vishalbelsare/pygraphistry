import {
    ref as $ref,
    pathValue as $pathValue
} from 'falcor-json-graph';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function release({ loadConfig }, routesSharedState) {
    return [{
        route: `release.current.date`,
        get(path) {
            const { request: { query: options = {}}} = this;
            return loadConfig({
                ...routesSharedState, options
            })
            .map(({ RELEASE }) => $pathValue(
                `release.current.date`, RELEASE
            ));
        }
    }]
}
