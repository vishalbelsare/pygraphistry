import { Observable } from 'rxjs/Observable';

export function tickLayout({ view, play = true, layout = true }) {
  return Observable.defer(() => {
    const { nBody } = view;
    nBody.interactions.next({ play, layout });
    return Observable.empty();
  });
}
