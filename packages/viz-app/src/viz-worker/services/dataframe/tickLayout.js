import { Observable } from 'rxjs/Observable';

export function tickLayout({ view }) {
    const { nBody } = view;
    nBody.interactions.next({
        play: true, layout: true
    });
    return Observable.empty();
}
