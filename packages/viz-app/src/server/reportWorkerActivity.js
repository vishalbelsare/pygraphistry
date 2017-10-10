import { connectToMongo } from './connectToMongo';
import { Scheduler, Observable } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';

const logger = commonLogger.createLogger('viz-server:pings');

export function reportWorkerActivity({
  config /*: ConfigOptions */,
  isWorkerActive /*: Observable<boolean>*/,
  pingInterval /*: number */ = 3
}) {
  if (!config.PINGER_ENABLED) {
    logger.debug('Pinger is disabled in config, so returning a noop Observable');
    return Observable.of(0);
  }

  // Connect to the Mongo server
  return (
    connectToMongo({ config })
      // If we successfully connect to the database, start the ping cycle.
      // Send the latest value from the `isWorkerActive` Observable to the
      // MongoDB instance. This process is repeated on an interval determined
      // by the `pingInterval` argument (3s by default).
      //
      // If either the DB update fails, the error is communicated
      // to the parent process, which exits this process with exit code 1.
      //
      .mergeMap(database =>
        Observable.interval(pingInterval * 1000)
          .startWith(0)
          .combineLatest(isWorkerActive, (x, isActive) => isActive)
          .mergeMap(isActive => updateNodeMonitor(database, isActive))
      )
  );

  function updateNodeMonitor(database, isActive) {
    const query = {
      pid: process.pid,
      ip: config['HOSTNAME'],
      port: config.VIZ_LISTEN_PORT
    };

    logger.trace({ query, isActive }, 'Pinging MongoDB with worker status');

    const update = {
      $set: {
        active: isActive,
        updated: new Date()
      }
    };
    const metadata = { upsert: true };

    const collection = database.collection('node_monitor');
    const updateCollection = Observable.bindNodeCallback(collection.update.bind(collection));

    return (
      updateCollection(query, update, metadata)
        .catch(catchUpdateError)
        // If isActive is false, turn the update Observable into a
        // Promise. It's possible the outer subscription is about to
        // unsubscribe, which could cancel this last in-flight request.
        // If we make the Observable a Promise, then the request *can't*
        // be canceled.
        .let(source => (isActive ? source : source.toPromise()))
    );
  }

  function catchUpdateError(error) {
    return Observable.throw({
      error,
      shouldExit: true,
      exitCode: 1,
      message: 'Error updating mongo, exiting'
    });
  }
}
