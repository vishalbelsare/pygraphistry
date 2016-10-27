import { ref as $ref, pathValue as $value } from '@graphistry/falcor-json-graph';

export function app({ loadConfig }) {
    return [{
        route: `release.current.['tag', 'buildNumber']`,
        returns: `String`,
        get(path) {
            const { request: { query: options = {}}} = this;
            return loadConfig({
                options
            })
            .switchMap(({ RELEASE }) =>
                Observable.from([
                    $value(`release.current.tag`, RELEASE || ''),
                    $value('release.current.buildNumber', __BUILDNUMBER__),
                ])
            );
        }
    }]
}
