import { Observable, Scheduler } from 'rxjs';
import { logger as commonLogger } from '@graphistry/common';
import { fromPathsOrPathValues } from '@graphistry/falcor-path-syntax';
const logger = commonLogger.createLogger('viz-app/worker/services/sendFalcorUpdate.js');

export function sendFalcorUpdate(getSocket, getDataSource) {
  return function sendFalcorUpdate({ paths: _paths = [], invalidated: _invalidated = [] }) {
    const socket = getSocket();
    if (!socket) {
      logger.debug(`Attempted to send falcor update, but no socket connected yet.`);
      return Observable.of(0, Scheduler.async);
    }
    const dataSource = getDataSource({ ...socket.handshake });
    _paths = fromPathsOrPathValues(_paths);
    _invalidated = fromPathsOrPathValues(_invalidated);
    return dataSource
      .get(_paths)
      .mergeMap(({ paths, jsonGraph, invalidated = [] }) => {
        logger.debug(`sending falcor update`, jsonGraph);
        return Observable.bindCallback(socket.emit.bind(socket))('falcor-update', {
          paths,
          jsonGraph,
          invalidated: _invalidated.concat(invalidated)
        });
      })
      .mapTo(0);
  };
}
