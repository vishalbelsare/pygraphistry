import { Observable } from 'rxjs';
import SocketDataSource from '@graphistry/falcor-socket-datasource';
const readyStates = {
    CONNECTING: 0,
    OPEN:       1,
    CLOSING:    2,
    CLOSED:     3
};

export class RemoteDataSource extends SocketDataSource {
    constructor(...args) {
        super(...args);
        this.socket.on('falcor-update', this.falcorUpdateHandler.bind(this));
        if (window && window.postMessage) {
            Observable
                .fromEvent(window, 'message')
                .mergeMap((message) => this.postMessageUpdateHandler(message))
                .subscribe();
        }
    }
    postMessageUpdateHandler(message = {}) {
        const { data } = message;
        if (typeof data !== 'object') {
            return Observable.empty();
        }
        const { model } = this;
        const { type, values } = data;
        if (!model ||
            type !== 'falcor-update' ||
            !Array.isArray(values)) {
            return Observable.empty();
        }
        var openViewPath = model._optimizePath(
            ['workbooks', 'open', 'views', 'current']
        );
        return model.set(...values.map(({ path, value }) => {
            path = openViewPath.concat(path);
            if (value && value.$type === 'ref') {
                value.value = openViewPath.concat(value.value);
            }
            return { path, value };
        }));
    }
    falcorUpdateHandler({ paths, invalidated, jsonGraph }) {
        const { model } = this;
        if (!model) {
            return;
        }
        if (invalidated && Array.isArray(invalidated)) {
            model.invalidate(...invalidated);
        }
        if (paths && jsonGraph) {
            model._setJSONGs(model, [{ paths, jsonGraph }]);
            model._root.onChangesCompleted &&
            model._root.onChangesCompleted.call(model);
        }
    }
    call(functionPath, args, refSuffixes, thisPaths) {
        return {
            subscribe: (observer, ...rest) => {
                if (typeof observer === 'function') {
                    observer = {
                        onNext: observer,
                        onError: rest[0],
                        onCompleted: rest[1]
                    };
                }
                const { socket, model } = this;
                if (socket.connected !== true) {
                    if (model && thisPaths && thisPaths.length) {
                        const thisPath = functionPath.slice(0, -1);
                        const jsonGraphEnvelope = {};
                        model._getPathValuesAsJSONG(
                            model
                                .boxValues()
                                ._materialize()
                                .withoutDataSource()
                                .treatErrorsAsValues(),
                            thisPaths.map((path) => thisPath.concat(path)),
                            [jsonGraphEnvelope]
                        );
                        observer.onNext(jsonGraphEnvelope);
                    }
                    observer.onCompleted();
                    return { dispose() {} };
                }
                return super
                    .call(functionPath, args, refSuffixes, thisPaths)
                    .subscribe(observer);
            }
        };
    }
    get(pathSets) {
        return {
            subscribe: (observer, ...rest) => {
                if (typeof observer === 'function') {
                    observer = {
                        onNext: observer,
                        onError: rest[0],
                        onCompleted: rest[1]
                    };
                }
                const { socket, model } = this;
                if (socket.connected !== true) {
                    if (model) {
                        const jsonGraphEnvelope = {};
                        model._getPathValuesAsJSONG(
                            model
                                .boxValues()
                                ._materialize()
                                .withoutDataSource()
                                .treatErrorsAsValues(),
                            pathSets,
                            [jsonGraphEnvelope]
                        );
                        observer.onNext(jsonGraphEnvelope);
                    }
                    observer.onCompleted();
                    return { dispose() {} };
                }
                return super
                    .get(pathSets)
                    .subscribe(observer);
            }
        };
    }
    set(jsonGraphEnvelope) {
        return {
            subscribe: (observer, ...rest) => {
                if (typeof observer === 'function') {
                    observer = {
                        onNext: observer,
                        onError: rest[0],
                        onCompleted: rest[1]
                    };
                }
                const { socket, model } = this;
                if (socket.connected !== true) {
                    observer.onNext(jsonGraphEnvelope);
                    observer.onCompleted();
                    return { dispose() {} };
                }
                return super
                    .set(jsonGraphEnvelope)
                    .subscribe(observer);
            }
        };
    }
}
