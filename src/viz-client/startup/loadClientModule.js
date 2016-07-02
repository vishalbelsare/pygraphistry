import { Observable } from '@graphistry/rxjs';

// Have to hard-code the client module names instead of specifying them
// dynamically so webpack can statically analyze the `require.ensure` calls.
export function loadClientModule(options, debug) {
    return Observable.create((subscriber) => {
        const { client = 'main' } = options;
        if (client === 'main') {
            require.ensure(['../clients/main.js'], (require) => {
                subscriber.next(require('../clients/main.js').initialize);
                subscriber.complete();
            });
        } else if (client === 'static') {
            debug('IS_STATIC', true);
            require.ensure(['../clients/static.js'], (require) => {
                subscriber.next(require('../clients/static.js').initialize);
                subscriber.complete();
            });
        } else {
            subscriber.error(new Error(`Unrecognized client ${client}.`));
        }
    });
}
