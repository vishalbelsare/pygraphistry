import { connectToMongo } from './connectToMongo';
import { Scheduler, Observable } from 'rxjs';
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
        // Send the latest value from the `isWorkerActive` Observable to the
        // MongoDB instance. This process is repeated on an interval determined
        // by the `pingInterval` argument (3s by default).
        //
        // If either the DB update fails, the error is communicated
        // to the parent process, which exits this process with exit code 1.
        //
        .expand(runPingLoop);

    function runPingLoop(database) {

        const updateMongo = isWorkerActive
            .mergeMap((isActive) => updateNodeMonitor(database, isActive))
            .mapTo(database)

        return updateMongo
            .subscribeOn(Scheduler.async, pingInterval * 1000)
            .take(1);
    }

    function updateNodeMonitor(database, isActive) {

        const query = {
            'pid': process.pid,
            'ip': config['HOSTNAME'],
            'port': config.VIZ_LISTEN_PORT
        };
        const update = {
            '$set': {
                'active': isActive,
                'updated': new Date()
            }
        };
        const metadata = { 'upsert': true };

        const collection = database.collection('node_monitor');
        const updateCollection = Observable.bindNodeCallback(
            collection.update.bind(collection)
        );

        return updateCollection(query, update, metadata).catch(catchUpdateError);
    }

    function catchUpdateError(error) {
        return Observable.throw({
            error, shouldExit: true, exitCode: 1,
            message: 'Error updating mongo, exiting'
        });
    }
}
