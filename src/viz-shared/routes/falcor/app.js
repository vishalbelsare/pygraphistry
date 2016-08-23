import { ref as $ref, pathValue as $value } from 'reaxtor-falcor-json-graph';

export function app({ loadConfig }) {
    return [{
        route: `release.current.date`,
        returns: `String`,
        get(path) {
            const { request: { query: options = {}}} = this;
            return loadConfig({
                options
            })
            .map(({ RELEASE }) => $value(
                `release.current.date`, RELEASE || Date.now()
            ));
        }
    }]
}
