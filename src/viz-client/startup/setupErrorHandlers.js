import $ from 'jquery';
import { format } from 'util';
import { bind, partial } from 'lodash';
import { Subject, Observable } from 'rxjs';

export function setupErrorHandlers(document, window, options) {

    const $document = $(document);
    const reportURL = 'error';

    // Report all unhandled JS errors
    const unhandledExceptions = Observable.fromEvent(window, 'error', (errorEvent) => {
        const {error} = errorEvent;
        return {
            stack: error && error.stack || null,
            lineno: errorEvent.lineno,
            message: errorEvent.message,
            filename: errorEvent.filename
        };
    })
    .map(errorToJSON('JSError'));

    const ajaxExceptions = Observable.bindCallback(
        $document.ajaxError.bind($document),
        ({ result }, xhr, { url }, message) => ({
            url, result, message
        })
    )()
    .filter(({ url }) => {
        // Don't report ajax errors caused by posting errors to `/error`
        const errorURLPrefix = '/error';
        if (url.indexOf(errorURLPrefix, url.length - errorURLPrefix.length) !== -1) {
            return false;
        }
        return true;
    })
    .map(errorToJSON('AjaxError'));

    // Monkey-patch console.error and console.warn to post to the report URL.
    const consoleExceptions = ['error', 'warn']
        .filter((functionName) => functionName in console)
        .map((functionName) => {
            const notifier = new Subject();
            const originalFn = console[functionName];
            console[functionName] = function(message) {
                // Don't report errors from React
                if ((/react/i).test(message)) {
                    return;
                }
                originalFn.apply(this, arguments);
                notifier.next({
                    message: format.apply(this, arguments)
                });
            }
            return notifier.map(errorToJSON(`console.${functionName}`));
        });

    return unhandledExceptions
        .merge(ajaxExceptions, ...consoleExceptions)
        .mergeMap((json) => Observable.ajax.post(reportURL, json));

    function errorToJSON(type) {
        return function mapError(err) {
            return {
                err, type,
                params: options,
                module: 'streamgl',
                time: (new Date()).toUTCString(),
                origin: document.location.origin,
                userAgent: window.navigator.userAgent
            };
        }
    }
}
