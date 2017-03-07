import { format } from 'util';
import { bind, partial } from 'lodash';
import { Subject, Observable } from 'rxjs';

import { logger as commonLogger } from '@graphistry/common';
const logger = commonLogger.createDirectLogger('streamgl');

export function setupErrorHandlers(document, window, options) {

    const logFields = {
        params: options,
        origin: document.location.origin,
        userAgent: window.navigator.userAgent
    };

    // if (window.location.hostname.endsWith('graphistry.com')) {
    //     console.info('Logs: https://splunk.graphistry.com:3000/en-US/app/search/session_inspector?form.debugid=' + window.graphistryDebugId);
    // } else {
    //     console.info('Graphistry Debug Id:', window.graphistryDebugId);
    // }

    // Report all unhandled JS errors
    const unhandledExceptions = setupWindowOnerrorHandler();
    // Monkey-patch console.error and console.warn to post to the report URL.
    const consoleExceptions = setupConsoleHandler();
    const ajaxExceptions = setupAjaxErrorHandler();

    Observable
        .merge(unhandledExceptions, consoleExceptions, ajaxExceptions)
        .do((item) => logItem({...logFields, ...item}))
        .retry().publish().connect();

    return options;
}


function logItem(item) {
    const message = `${item.type}: ${item.message || 'Unknown client error'}`;
    logger.error(item, message);
}


function setupWindowOnerrorHandler() {
    const notifier = new Subject();
    window.onerror = function windowOnErrorHandler(messageOrEvent, source, lineno, colno, error) {
        const record = {type: 'JSError' };

        if(typeof messageOrEvent === 'string') {
            record.message = messageOrEvent;
        } else {
            record.message = 'Resource failed to load';
        }

        if(source || lineno || colno) {
            record.src = {file: source, line: lineno, column: colno};
        }

        if(error) { record.err = error };

        notifier.next(record);
        return false;
    }

    return notifier;
}


function setupConsoleHandler() {
    const consoleEvents = ['error', 'warn']
        .map((functionName) => {
            const notifier = new Subject();
            const originalFn = console[functionName];

            console[functionName] = function wrappedConsoleLogger(message) {
                notifier.next({ message: format.apply(this, arguments) });
                originalFn.apply(console, arguments);
            }

            return notifier.map(({message}) =>
                ({ type: `console.${functionName}`, message })
            );
        });

    return Observable.merge(...consoleEvents);
}


function setupAjaxErrorHandler() {
    //// Commented out because it's very rarely useful...
    // const $document = $(document);
    // const ajaxExceptions = Observable.bindCallback(
    //     $document.ajaxError.bind($document),
    //     ({ result }, xhr, { url }, message) => ({
    //         url, result, message
    //     })
    // )()
    // .filter(({ url }) => {
    //     // Don't report ajax errors caused by posting errors to `/error`
    //     const errorURLPrefix = `/error`;
    //     if (url.indexOf(errorURLPrefix, url.length - errorURLPrefix.length) !== -1) {
    //         return false;
    //     }
    //     return true;
    // })
    // .map(({url, result, message}) =>
    //     [{type: 'AjaxError', url, result}, message]);

    return Observable.never();
}
