import {
    ref as $ref,
    pathValue as $pathValue
} from 'reaxtor-falcor-json-graph';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../routes';

export function app({ loadConfig }) {
    return [{
        route: `release.current.date`,
        returns: `String`,
        get(path) {
            const { request: { query: options = {}}} = this;
            return loadConfig({
                options
            })
            .map(({ RELEASE }) => $pathValue(
                `release.current.date`, RELEASE || Date.now()
            ));
        }
    }]
}
