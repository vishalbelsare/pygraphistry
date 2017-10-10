import { Observable } from 'rxjs';
import { vboUpdates } from '../app/events/vboUpdates';
import { loadingStatus } from '../app/events/loadingStatus';
import { sizesForMalloc } from '../app/events/sizesForMalloc';

export function setupSocketHandlers(args) {
  const { model, socket } = args;

  const onError = Observable.fromEvent(socket, 'error').mergeMap(reason =>
    Observable.throw(
      `Connection error (reason: ${reason || ''} ${(reason && reason.description) || ''})`
    )
  );

  const onDisconnect = Observable.fromEvent(socket, 'disconnect').mergeMap(reason => {
    $('#simulation')
      .parent()
      .addClass('disconnected');

    const $reasonSpan = $(`
                <span>Disconnected (reason: ${reason}).</span>
            `);

    const $reloadLink = $(`
                <a href='javascript: void(0)'>Reload the frame.</a>
            `).click(() => document.location.reload());

    $reasonSpan.append($reloadLink);

    return Observable.throw($reasonSpan);
  });

  const onVBOUpdate = Observable.fromEvent(socket, 'vbo_update');
  const onLoadingStatus = Observable.fromEvent(socket, 'update_loading_status').pluck('message');
  const onSizesForMalloc = Observable.fromEvent(socket, 'sizes_for_memory_allocation');

  return Observable.merge(
    onError,
    onDisconnect,
    onVBOUpdate.do(vboUpdates),
    onLoadingStatus.do(loadingStatus),
    onSizesForMalloc.do(sizesForMalloc)
  );
}
