import $ from 'jquery';
import { format } from 'util';
import { bind, partial } from 'lodash';
import { Subject, Observable } from 'rxjs';

import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createDirectLogger('streamgl');

export function setupErrorHandlers(document, window, options) {
    const $document = $(document);

    const logFields = {
        params: options,
        origin: document.location.origin,
        userAgent: window.navigator.userAgent
    }

    if (window.location.hostname.endsWith('graphistry.com')) {
        console.info('Logs: https://splunk.graphistry.com:3000/en-US/app/search/session_inspector?form.debugid=' + window.graphistryDebugId);
    } else {
        console.info('Graphistry Debug Id:', window.graphistryDebugId);
    }

    // Report all unhandled JS errors
    const unhandledExceptions = Observable.fromEvent(window, 'error', (errorEvent) => {
        return [
            {err: errorEvent.error, type: 'JSError'}, 'Uncaught JavaScript exception'];
    });


    const ajaxExceptions = Observable.bindCallback(
        $document.ajaxError.bind($document),
        ({ result }, xhr, { url }, message) => ({
            url, result, message
        })
    )()
    .filter(({ url }) => {
        // Don't report ajax errors caused by posting errors to `/error`
        const errorURLPrefix = `/error`;
        if (url.indexOf(errorURLPrefix, url.length - errorURLPrefix.length) !== -1) {
            return false;
        }
        return true;
    })
    .map(({url, result, message}) =>
        [{type: 'AjaxError', url, result}, message]);


    // Monkey-patch console.error and console.warn to post to the report URL.
    const consoleExceptions = ['error', 'warn']
        .filter((functionName) => functionName in console)
        .map((functionName) => {
            const notifier = new Subject();
            const originalFn = console[functionName];
            console[functionName] = function(message) {
                // Don't report errors from React
                // if ((/react/i).test(message)) {
                //     return;
                // }
                notifier.next({
                    message: format.apply(this, arguments)
                });
            }
            return notifier.map(({message}) => [{type: 'console.${functionName}'}, message]);
        });


    return unhandledExceptions
        .merge(ajaxExceptions, ...consoleExceptions)
        .map((record = [{}, '']) => {
            logger.error({...logFields, ...record[0]}, record[1]);
            return record;
        });
}
