import request from 'request';
import { connectToMongo } from './connectToMongo';
import { Scheduler, Observable } from '@graphistry/rxjs';
import { logger as commonLogger } from '@graphistry/common';

const logger = commonLogger.createLogger('viz-server:pings');

export function reportWorkerActivity({
        url/*: String*/,
        config/*: ConfigOptions */,
        pingInterval/*: number */ = 3,
        isWorkerActive /*: Observable<boolean>*/
    }) {

    if (!config.PINGER_ENABLED) {
        return Observable.of(0);
    }

    // Connect to the Mongo server
    return connectToMongo({ config })
        // If we successfully connect to the database, start the ping cycle.
        // First, make a request to the server provided in the `url` argument.
        // If the URL request succeeds, send the latest value from the
        // `isWorkerActive` Observable to the MongoDB instance. This process is
        // repeated on an interval determined by the `pingInterval` argument (3s
        // by default).
        //
        // If either the request or DB update fails, the error is communicated
        // to the parent process, then exits this process with exit code 1.
        //
        .expand(runPingLoop);

    function runPingLoop(database) {

        const pingRequest = Observable
            .bindNodeCallback(request, (req, body) => {
                if (req.statusCode === 200) {
                    return body;
                }
                throw new Error('Error connecting to Mongo.');
            })(url)
            .catch(catchPingRequestError);

        const pingThenUpdate = pingRequest
            .withLatestFrom(isWorkerActive, (body, isActive) =>
                updateNodeMonitor(database, isActive, body))
            .mergeAll()
            .mapTo(database);

        return pingThenUpdate
            .subscribeOn(Scheduler.asap, pingInterval * 1000)
            .take(1);
    }

    function catchPingRequestError(error) {
        return Observable.throw({
            error, shouldExit: true, exitCode: 1,
            message: 'Error connecting to Mongo, exiting.'
        });
    }

    function updateNodeMonitor(database, isActive, body) {

        const query = {
            'ip': body, 'pid': process.pid,
            'port': config.VIZ_LISTEN_PORT
        };
        const update = {
            '$set': {
                'active': isActive,
                'updated': new Date()
            }
        };
        const metadata = { 'upsert': true };

        return Observable.from(database
                .collection('node_monitor')
                .update(query, update, metadata))
            .catch(catchUpdateError);
    }

    function catchUpdateError(error) {
        return Observable.throw({
            error, shouldExit: true, exitCode: 1,
            message: 'Error updating mongo, exiting'
        });
    }
}
