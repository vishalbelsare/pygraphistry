import { Observable } from 'rxjs';

// Have to hard-code the client module names instead of specifying them
// dynamically so webpack can statically analyze the `require.ensure` calls.
export function loadClientModule(options, debug) {
    return Observable.create((subscriber) => {
        const { client = 'main' } = options;
        if (client === 'main' || client === 'static' ) {
            require.ensure(['../clients/main/index.js'], (require) => {
                subscriber.next(require('../clients/main/index.js').initialize);
                subscriber.complete();
            });
        } else {
            subscriber.error(new Error(`Unrecognized client ${client}.`));
        }
    });
}
