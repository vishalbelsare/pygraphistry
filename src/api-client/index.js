import { Model } from 'viz-client/falcor';
import $$observable from 'symbol-observable';
import { Observable } from 'rxjs/Observable';
import { AsyncSubject } from 'rxjs/AsyncSubject';
import { asap as AsapScheduler } from 'rxjs/scheduler/asap';
import { PostMessageDataSource } from '@graphistry/falcor-socket-datasource';
import fetchDataUntilSettled from '@graphistry/falcor-react-redux/lib/utils/fetchDataUntilSettled';
import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

class Graphistry extends Observable {
    static view = null;
    static model = null;
    static workbook = null;
    static iFrame = null;
    constructor(source) {
        if (!source || typeof source === 'function' || typeof source !== 'object') {
            super(source);
        } else {
            super();
            if (typeof source[$$observable] === 'function') {
                this.source = source[$$observable]();
            } else {
                this.source = this.constructor.from(source);
            }
        }
    }
    lift(operator) {
        const observable = new Graphistry(this);
        observable.operator = operator;
        return observable;
    }
    static addColumns(...columns) {
        const { view } = this;
        return new this(this
            .from(columns)
            .concatMap((column) => view.call('columns.add', column))
            .takeLast(1)
            .mergeMap(() => fetchDataUntilSettled({
                data: {}, falcor: view, fragment: ({ columns = [] } = {}) => `{
                    columns: {
                        length, [0...${columns.length || 0}]: {
                            name, dataType, identifier, componentType
                        }
                    }
                }`
            }))
            .takeLast(1)
            .map(({ data }) => data.toJSON())
            .toPromise()
        );
    }
    static openFilters() {
        const { view } = this;
        return new this(view.set(
            $value(`filters.controls[0].selected`, true),
            $value(`scene.controls[1].selected`, false),
            $value(`labels.controls[0].selected`, false),
            $value(`layout.controls[0].selected`, false),
            $value(`exclusions.controls[0].selected`, false),
            $value(`panels.left`, $ref(view._path.concat(`filters`)))
        )
        .map(({ json }) => json.toJSON())
        .toPromise());
    }
    static closeFilters() {
        const { view } = this;
        return new this(view.set(
            $value(`panels.left`, undefined),
            $value(`filters.controls[0].selected`, false)
        )
        .map(({ json }) => json.toJSON())
        .toPromise());
    }
    static startClustering(milliseconds = 2000, cb) {
        const { view } = this;
        if (!milliseconds || milliseconds <= 0) {
            return new this(view.set(
                $value(`scene.simulating`, true),
                $value(`scene.controls[0].selected`, true),
            )
            .last()
            .map(({ json }) => json.toJSON())
            .do((x) => cb && cb(null, x), cb)
            .toPromise());
        }
        return new this(this
            .startClustering(0)
            .concat(this
                .timer(milliseconds)
                .mergeMap(() => this.stopClustering(cb)))
            .toPromise());
    }
    static stopClustering(cb) {
        const { view } = this;
        return new this(view.set(
            $value(`scene.simulating`, false),
            $value(`scene.controls[0].selected`, false),
        )
        .last()
        .map(({ json }) => json.toJSON())
        .do((x) => cb && cb(null, x), cb)
        .toPromise());
    }
    static autocenter(percentile, cb) {

    }
    static saveWorkbook(cb) {

    }
    static exportStatic(name, cb) {

    }
    static toggleChrome(show, cb) {
        const { view } = this;
        return new this(view.set(
            $value(`toolbar.visible`, !!show)
        )
        .last()
        .map(({ json }) => json.toJSON())
        .do((x) => cb && cb(null, x), cb)
        .toPromise());
    }
    static addFilter(expr, cb) {

    }
    static addExclusion(expr, cb) {

    }
    static updateEncoding(entityType, encodingAttribute, encodingMode, dataAttribute, cb) {

    }
    static updateSetting(name, val, cb) {

    }
    static updateZoom(level, cb) {

    }
    static subscribeLabels(subscriptions, cb) {

    }
    static unsubscribeLabels(cb) {

    }
}

function GraphistryJS(iFrame) {

    if (!iFrame) {
        throw new Error('No iframe provided to Graphistry');
    }

    const model = new Model({
        recycleJSON: true,
        scheduler: AsapScheduler,
        treatErrorsAsValues: true,
        allowFromWhenceYouCame: true,
        source: new PostMessageDataSource(window, iFrame.contentWindow)
    });

    class InstalledGraphistry extends Graphistry {
        static model = model;
        static iFrame = iFrame;
        lift(operator) {
            const observable = new InstalledGraphistry(this);
            observable.operator = operator;
            return observable;
        }
    }

    InstalledGraphistry = wrapStaticObservableMethods(Observable, InstalledGraphistry);

    return InstalledGraphistry.defer(() => {

        const initEvent = Observable
            .fromEvent(window, 'message')
            .filter(({ data }) => data && data.type === 'init')
            .do(({ data }) => model.setCache(data.cache))
            .mergeMap(
                ({ data }) => model.get(`workbooks.open.views.current.id`),
                ({ data, source }, { json }) => {

                    const workbook = json.workbooks.open;
                    const view = workbook.views.current;

                    InstalledGraphistry.workbook = model.deref(workbook);
                    InstalledGraphistry.view = model.deref(view);

                    console.log(`initialized with view '${view.id}'`);
                    console.log('parent sending initialized message');

                    source.postMessage({
                        type: 'initialized',
                        agent: 'graphistryjs',
                        version: __VERSION__
                    }, '*');

                    return InstalledGraphistry;
                }
            )
            .take(1)
            .multicast(new AsyncSubject());

        initEvent.connect();

        console.log('parent sending ready message');

        // trigger hello if missed initial one
        iFrame.contentWindow.postMessage({
            type: 'ready',
            agent: 'graphistryjs',
            version: __VERSION__
        }, '*');

        return initEvent;
    });
}

import 'rxjs/add/operator/do';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/last';
import 'rxjs/add/operator/take';
import 'rxjs/add/operator/delay';
import 'rxjs/add/operator/merge';
import 'rxjs/add/operator/concat';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/concatMap';
import 'rxjs/add/operator/multicast';
import 'rxjs/add/operator/toPromise';
import 'rxjs/add/operator/takeUntil';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/observable/defer';
import 'rxjs/add/observable/timer';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/concat';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/observable/bindCallback';

Graphistry = wrapStaticObservableMethods(Observable, Graphistry);

module.exports = GraphistryJS;
module.exports.GraphistryJS = GraphistryJS;

function wrapStaticObservableMethods(Observable, Graphistry) {
    function createStaticWrapper(staticMethodName) {
        return function(...args) {
            return new Graphistry(Observable[staticMethodName](...args));
        }
    }
    for (const staticMethodName in Observable) {
        Graphistry[staticMethodName] = createStaticWrapper(staticMethodName);
    }
    Graphistry.bindCallback = (...args) => (...args2) => new Graphistry(Observable.bindCallback(...args)(...args2));
    return Graphistry;
}
