import { Observable, Subscription } from 'rxjs';

export function addSocketHandlers(socket, vizServer, eventHandlers) {
    return function addSocketHandlersOnSocketSubscribe(subscription) {

        eventHandlers.forEach(({ event, handler }) => {
            socket.on(event, handler);
        });

        const disconnect = Observable.fromEvent(socket, 'disconnect', () => (
                                         { socket, type: 'disconnect' }));
        const connection = Observable.of({ socket, type: 'connection' });

        return connection.concat(disconnect);
    }
}

export function removeSocketHandlers(socket, vizServer, eventHandlers) {
    return function removeSocketHandlersOnSocketDispose() {
        const composite = new Subscription();
        composite.add(vizServer);
        composite.add(function disposeVizWorkerSocket() {
            eventHandlers.forEach(({ event, handler }) => {
                socket.removeListener(event, handler);
            });
            socket.disconnect();
        });
        return composite;
    }
}

