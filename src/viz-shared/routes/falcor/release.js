import {
    ref as $ref,
    pathValue as $pathValue
} from 'falcor-json-graph';
import { getHandler,
         getIDsFromJSON,
         mapObjectsToAtoms,
         captureErrorStacks } from '../support';

export function release({ loadConfig }) {
    return [{
        route: `release.current.date`,
        returns: `string`,
        get(path) {
            const { request: { query: options = {}}} = this;
            return loadConfig({
                options
            })
            .map(({ RELEASE }) => $pathValue(
                `release.current.date`, RELEASE
            ));
        }
    }]
}
