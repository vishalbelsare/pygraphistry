import { Observable } from 'rxjs/Observable';
import { $value } from '@graphistry/falcor-json-graph';

export function app() {
  return [
    {
      route: `release.current['tag', 'buildNumber']`,
      returns: `String`,
      get(path) {
        return Observable.from([
          $value(`release.current.tag`, __RELEASE__ || ''),
          $value('release.current.buildNumber', __BUILDNUMBER__)
        ]);
      }
    }
  ];
}
