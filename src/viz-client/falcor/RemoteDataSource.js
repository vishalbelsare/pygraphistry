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

        var initResponse = function (event) {
            if (event && event.data && event.data.graphistry === 'init') {
                parent.postMessage({graphistry: 'init'},'*');
                console.log('Connected to parent windoe', event.data);
                window.removeEventListener('message', initResponse, false);
            }
        };
        window.addEventListener('message', initResponse, false);
        parent.postMessage({graphistry: 'init'},'*');


        if (window && window.postMessage) {
            Observable
                .fromEvent(window, 'message')
                .mergeMap((message) => this.postMessageUpdateHandler(message))
                .subscribe();

            Observable
                .fromEvent(window, 'message')
                .filter( (e) => e && e.data && e.data.mode === 'graphistry-action')
                .mergeMap((message) => this.postMessageActionHandler(message))
                .subscribe();

            Observable
                .fromEvent(window, 'message')
                .filter( (e) => e && e.data && e.data.mode === 'graphistry-action-streamgl')
                .map(this.postMessageStreamglHandler.bind(this))
                .subscribe();
        }
    }


    postMessageStreamglRunner(message, thunk) {
        var that = this;
        var fired = false;

        var errorHandler = function (error)  {
            if (!fired) {
                fired = true;
                parent.postMessage({tag: message.data.tag, error: error || 'error'}, '*');
            }
        };
        var succeesHandler = function (success) {
            if (!fired) {
                fired = true;
                parent.postMessage({tag: message.data.tag, success: success || 'success'}, '*');
            }
        };
        var cb = function (error, success) {
            if (error) {
                errorHandler(error);
            } else {
                succeesHandler(success);
            }
        };

        try {
            thunk(cb);
        } catch (exn) {
            console.error('postMessageStreamglRunner', exn);
            errorHandler('error');
            return;
        }
        if (!fired) {
            fired = true;
            succeesHandler();
        }
    }

    postMessageStreamglHandler(message = {}) {

        console.log("Received StreamGL action", message.data);

        var hasClass = function (element, selector) {
            var className = " " + selector + " ";
            return ( (" " + element.className + " ").replace(/[\n\t]/g, " ").indexOf(className) > -1 )
        };

        switch (message.data.type) {
            case 'startClustering':

                return this.postMessageStreamglRunner(message, (cb) => {
                    var toggle = document.getElementById('toggle-simulating');
                    if (!hasClass(toggle, 'active')) {
                        toggle.click();
                    }

                    setTimeout(function () {
                        if (hasClass(toggle, 'active')) {
                            toggle.click();
                        }
                    }, Math.min(2000, message.data.args.duration))
                    cb();
                });

            case 'stopClustering':

                return this.postMessageStreamglRunner(message, (cb) => {
                    var toggle = document.getElementById('toggle-simulating');
                    if (hasClass(toggle, 'active')) {
                        toggle.click();
                    }
                    cb();
                });

            case 'autocenter':

                return this.postMessageStreamglRunner(message, (cb) => {
                    if (message.data.args.percentile) {
                        console.warn('Centering does not yet support percentile');
                    }
                    document.getElementById('center-camera').click();
                    cb();
                });

            case 'toggleChrome':

                return this.postMessageStreamglRunner(message, (cb) => {
                    if (message.data.args && message.data.args.toggle) {
                        document.body.classList.remove('hide-chrome');
                    } else {
                        document.body.classList.add('hide-chrome');
                    }
                    cb();
                });
        }

        console.error('Unknown StreamGL action', message.data.type);
    }

    postMessageActionHandler(message = {}) {
        console.error('no postMessageActionHandler', new Error({message, text: 'now what??'}));
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
