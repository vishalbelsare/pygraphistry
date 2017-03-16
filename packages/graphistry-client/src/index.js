import shallowEqual from 'recompose/shallowEqual';
import { Model } from '@graphistry/falcor-model-rxjs';
import { PostMessageDataSource } from '@graphistry/falcor-socket-datasource';
import { $ref, $atom, $value, $invalidate } from '@graphistry/falcor-json-graph';
import { $$observable, Subject, Scheduler, Observable, AsyncSubject, ReplaySubject } from './rxjs';

/**
 * @class Graphistry
 * @classdesc This object wraps a HTML IFrame of a Graphistry Visualization in order
 * to provide an API for interacting with the graph.
 * @extends Observable
 * @see {@link https://github.com/ReactiveX/rxjs/blob/master/doc/observable.md}
 */
class Graphistry extends Observable {
    static view = null;
    static model = null;
    static workbook = null;
    static iFrame = null;

    /**
     * Create Graphistry Observable by extending observable's methods
     * @param {Object} source - The source observable.
     */
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

    /**
     * Creates a new Observable with this as the source, and the passed
     * operator as the new Observable's operator.
     * @method Graphistry~lift
     * @param {Operator} operator - the operator defining the operation to take on the
     * observable
     * @return {Observable} a new observable with the operator applied
     */
    lift(operator) {
        const observable = new Graphistry(this);
        observable.operator = operator;
        return observable;
    }

    static _getIds(componentType, name, dataType, values = []) {
        const { view } = this;
        return new this(view
            .call(`componentsByType['${componentType}'].rows.filter`, [name, dataType, values], ['_index'])
            .takeLast(1)
            .map(({ json = {} }) => {
                const { componentsByType = {} } = json;
                const { [componentType]: componentsForType = {} } = componentsByType;
                const { rows = {} } = componentsForType;
                return Array
                    .from(rows.filter || [])
                    .filter(Boolean).map(({ _index }) => _index);
            })
            .toPromise()
        );
    }

    /**
     * Add columns to the current graph visuzliation's dataset
     * @method Graphistry.addColumns
     * @params {...Arrays} columns - One of more columns to be appended to the dataset
     * @return {Promise} A promise to return the result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function(g) {
     *         window.g = g;
     *         const columns = [
     *             ['edge', 'highways', [66, 101, 280], 'number'],
     *             ['point', 'theme parks', ['six flags', 'disney world', 'great america'], 'string']
     *         ];
     *         console.log('adding columns', columns);
     *         return g.addColumns.apply(g, columns);
     *     })
     *     .subscribe();
     */
    static addColumns(...columns) {
        const { view } = this;
        return new this(this
            .from(columns)
            .concatMap((column) => view.call('columns.add', column))
            .map(({ json: { columns }}) => columns).filter(Boolean)
            .map((columns) => columns[columns.length - 1].toJSON())
            .toArray()
            .toPromise()
        );
    }


     /**
     * Change colors based on an attribute
     * @method Graphistry.encodeColor
     * @param {GraphType} [graphType] - 'point' or 'edge'
     * @param {Attribute} [attribute] - name of data column, e.g., 'degree'
     * @param {Variant} [variation] - If there are more bins than colors, use 'categorical' to repeat colors and 'continuous' to interpolate
     * @param {Array} [colors] - array of color name or hex codes
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeColor('point', 'degree', 'categorical', ['black', 'white'])
     *     })
     *     .subscribe();
     */
    static encodeColor(graphType, attribute, variation, colors) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.color`,
                {   reset: false, variation, name: 'user_' + Math.random(),
                    encodingType: 'color', colors, graphType, attribute }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

     /**
     * Reset color to value at page load
     * @method Graphistry.resetColor
     * @param {GraphType} [graphType] - 'point' or 'edge'
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeColor('point', 'degree', 'categorical', ['black', 'white'])
     *         return g.resetColor('point')
     *     })
     *     .subscribe();
     */
    static resetColor(graphType) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.color`,
                {   reset: true, encodingType: 'color' }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

//=========


     /**
     * Change icons based on an attribute
     * @method Graphistry.encodeIcons
     * @param {GraphType} [graphType] - 'point' or 'edge'
     * @param {Attribute} [attribute] - name of data column, e.g., 'icon'
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeIcons('point', 'icon')
     *     })
     *     .subscribe();
     */
    static encodeIcons(graphType, attribute) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.icon`,
                {   reset: false, name: 'user_' + Math.random(),
                    encodingType: 'icon', graphType, attribute }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

     /**
     * Reset icons to value at page load
     * @method Graphistry.resetIcons
     * @param {GraphType} [graphType] - 'point' or 'edge'
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeIcons('point', 'icon')
     *         return g.resetIcons('point')
     *     })
     *     .subscribe();
     */
    static resetIcons(graphType) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.icon`,
                {   reset: true, encodingType: 'icon' }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

//=========



    /**
     * Change size based on an attribute
     * @method Graphistry.encodeSize
     * @param {GraphType} [graphType] - 'point'
     * @param {Attribute} [attribute] - name of data column, e.g., 'degree'
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeSize('point', 'community_infomap')
     *     })
     *     .subscribe();
     */
    static encodeSize(graphType, attribute) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.size`,
                {   reset: false, name: 'user_' + Math.random(),
                    encodingType: 'size', graphType, attribute }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }


    /**
     * Reset size to value at page load
     * @method Graphistry.resetSize
     * @param {GraphType} [graphType] - 'point'
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.encodeSize('point', 'community_infomap')
     *         return g.resetSize('point')
     *     })
     *     .subscribe();
     */
    static resetSize(graphType) {
        const { view } = this;
        return new this(view.set(
            $value(`histograms.encodings.${graphType}.size`,
                {   reset: true, encodingType: 'size' }))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

     /**
     * Toggle a leftside panel
     * @method Graphistry.toggleLeftPanel
     * @param {string} [panel] - Name of panel: filters, exclusions, scene, labels, layout
     * @param {boolean} [turnOn] - Whether to make panel visible, or turn all off
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('opening filters');
     *         return g.toggleLeftPanel('filters', true);
     *     })
     *     .subscribe();
     */
    static toggleLeftPanel(panel, turnOn) {
        const { view } = this;
        if (turnOn) {
            return new this(view.set(
                $value(`filters.controls[0].selected`, panel === 'filters'),
                $value(`scene.controls[1].selected`, panel === 'scene'),
                $value(`labels.controls[0].selected`, panel === 'labels'),
                $value(`layout.controls[0].selected`, panel === 'layout'),
                $value(`exclusions.controls[0].selected`, panel === 'exclusions'),
                $value(`panels.left`,
                    panel === 'filters' ? $ref(view._path.concat(`filters`))
                    : panel === 'scene' ? $ref(view._path.concat(`scene`))
                    : panel === 'labels' ? $ref(view._path.concat(`labels`))
                    : panel === 'layout' ? $ref(view._path.concat(`layout`))
                    : $ref(view._path.concat(`exclusions`)))
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        } else {
            return new this(view.set(
                $value(`panels.left`, undefined),
                $value(`filters.controls[0].selected`, false),
                $value(`scene.controls[1].selected`, false),
                $value(`labels.controls[0].selected`, false),
                $value(`layout.controls[0].selected`, false),
                $value(`exclusions.controls[0].selected`, false)
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        }
    }

    /**
     * Toggle inspector panel
     * @method Graphistry.toggleInspector
     * @param {boolean} [turnOn] - Whether to make panel visible
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('opening inspector panel');
     *         return g.toggleInspector(true);
     *     })
     *     .subscribe();
     */
    static toggleInspector(turnOn) {
        const { view } = this;
        if (!turnOn) {
            return new this(view.set(
                $value(`panels.bottom`, undefined),
                $value(`inspector.controls[0].selected`, false),
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        } else {
            return new this(view.set(
                $value(`inspector.controls[0].selected`, true),
                $value(`timebar.controls[0].selected`, false),
                $value(`panels.bottom`, $ref(view._path.concat(`inspector`)))
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        }
    }

    /**
     * Toggle histogram panel
     * @method Graphistry.toggleHistograms
     * @param {boolean} [turnOn] - Whether to make panel visible
     * @return {Promise} The result of the callback
     * @example
     *  GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('opening histogram panel');
     *         return g.toggleHistograms(true);
     *     })
     *     .subscribe();
     */
    static toggleHistograms(turnOn) {
        const { view } = this;
        if (!turnOn) {
            return new this(view.set(
                $value(`panels.right`, undefined),
                $value(`histograms.controls[0].selected`, false)
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        } else {
            return new this(view.set(
                $value(`histograms.controls[0].selected`, true),
                $value(`panels.right`, $ref(view._path.concat(`histograms`)))
            )
            .map(({ json }) => json.toJSON())
            .toPromise());
        }
    }

    /**
     * Close the filters panel
     * @method Graphistry.closeFilters
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('closing filters');
     *         return g.closeFilters();
     *     })
     *     .subscribe();
     */
    static closeFilters() {
        const { view } = this;
        return new this(view.set(
            $value(`panels.left`, undefined),
            $value(`filters.controls[0].selected`, false)
        )
        .map(({ json }) => json.toJSON())
        .toPromise());
    }

    /**
     * Run a number of steps of Graphistry's clustering algorithm
     * @method Graphistry.tickClustering
     * @static
     * @param {number} ticks - The number of ticks to run
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('starting to cluster');
     *         return g.tickClustering();
     *     })
     *     .subscribe();
     */
    static tickClustering(ticks = 1) {

        let obs;
        const { view } = this;

        if (typeof ticks !== 'number') {
            obs = Observable.of({});
        } else {
            obs = Observable
                .timer(0, 40)
                .take(Math.abs(ticks) || 1)
                .concatMap(() => view.call('tick', []))
                .takeLast(1);
        }

        return new this(obs.toPromise());
    }

    /**
     * Center the view of the graph
     * @method Graphistry.autocenter
     * @static
     * @param {number} percentile - Controls sensitivity to outliers
     * @param {function} [cb] - Callback function of type callback(error, result)
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('centering');
     *         return g.autocenter(.90);
     *     })
     *     .subscribe();
     */
    static autocenter(percentile, cb) {

    }

    /**
     * Read the workbook ID
     * @method Graphistry.getCurrentWorkbook
     * @static
     * @param {function} [cb] - Callback function of type callback(error, result)
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('getting workbook id');
     *         return g.getCurrentWorkbook();
     *     })
     *     .subscribe(function (workbook) {
     *         alert('id: ' + workbook.id)
     *     });
     */
    static getCurrentWorkbook() {
        const { workbook } = this;
         return new this(workbook.get('id')
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

    /**
     * Save the current workbook. A saved workbook will persist the analytics state
     * of the visualization, including active filters and exclusions
     * @method Graphistry.saveWorkbook
     * @static
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         return g.saveWorkbook();
     *     })
     *     .subscribe();
     */
    static saveWorkbook() {

        const { workbook } = this;

        return new this(workbook.call('save', [])
            .map(({ json }) => json.toJSON())
            .toPromise());
    }


    /**
     * Hide or Show Toolbar UI
     * @method Graphistry.toogleToolbar
     * @static
     * @param {boolean} show - Set to true to show toolbar, and false to hide toolbar.
     * @return {Promise} The result of the callback
     * @example
     *
     * <button onclick="window.graphistry.toggleToolbar(false)">Hide toolbar</button>
     * <button onclick="window.graphistry.toggleToolbar(true)">Show toolbar</button>
     *
     */
    static toggleToolbar(show) {
        return this.updateSetting('showToolbar', !!show);
    }

    /**
     * Add a filter to the visualization with the given expression
     * @method Graphistry.addFilter
     * @static
     * @param {string} expr - An expression using the same language as our in-tool
     * exclusion and filter panel
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('Adding filter for "point:degree > 0"');
     *         return g.addFilter('point:degree > 0');
     *     })
     *     .subscribe();
     */
    static addFilter(expr) {

        const { view } = this;

        return new this(view.call('filters.add', [expr])
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

    /**
     * Add an exclusion to the visualization with the given expression
     * @method Graphistry.addExclusion
     * @static
     * @param {string} expr - An expression using the same language as our in-tool
     * exclusion and filter panel
     * @return {Promise} The result of the callback
     * @example
     * GraphistryJS(document.getElementById('viz'))
     *     .flatMap(function (g) {
     *         window.g = g;
     *         console.log('Adding exclusion for "point:degree > 0"');
     *         return g.addExclusion('point:degree > 0');
     *     })
     *     .subscribe();
     */
    static addExclusion(expr) {
        const { view } = this;

        return new this(view.call('exclusions.add', [expr])
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

    /**
     * Modify a settings value in the visualization
     * Key settings: showArrows, pruneOrphans, edgeOpacity, edgeSize, pointOpacity,
     * pointSize, labelOpacity, labelEnabled, labelPOI, labelHighlightEnabled, zoom
     * @method Graphistry.updateSetting
     * @static
     * @param {string} name - the name of the setting to change
     * @param {string} val - the value to set the setting to.
     * @return {Promise} The result of the callback
     */
    static updateSetting(name, val) {

        const lookup = {

            //models/toolbar.js
            'showToolbar': ['view', 'toolbar.visible'],

            //models/scene/scene.js
            'pruneOrphans': ['view', 'pruneOrphans'],
            'showArrows':   ['view', 'scene.renderer.showArrows'],
            'background':   ['view', 'scene.renderer.background.color'],
            'edgeOpacity':  ['view', 'scene.renderer.edges.opacity'],
            'edgeSize':     ['view', 'scene.renderer.edges.scaling'],
            'pointOpacity': ['view', 'scene.renderer.points.opacity'],
            'pointSize':    ['view', 'scene.renderer.points.scaling'],

            //models/camera.js
            'zoom': ['view', 'scene.camera.zoom'],
            'center': ['view', 'scene.camera.center["x", "y", "z"]'],

            //models/label.js
            'labelOpacity': ['view', 'scene.labels.opacity'],
            'labelEnabled': ['view', 'scene.labels.enabled'],
            'labelPOI': ['view', 'scene.labels.poiEnabled'],
            'labelHighlightEnabled': ['view', 'scene.labels.highlightEnabled'],
            'labelColor': ['view', 'scene.labels.foreground.color'],
            'labelBackground': ['view', 'scene.labels.background.color'],

            //models/layout.js => viz-worker/simulator/layout.config.js:
            'precisionVsSpeed': ['view', 'layout.options.tau']

        };

        const [model, path] = lookup[name];

        return new this(this[model]
            .set($value(path, $atom(val, { $timestamp: Date.now() })))
            .map(({ json }) => json.toJSON())
            .toPromise());
    }

    /**
     * Update the camera zoom level
     * @method Graphistry.updateZoom
     * @static
     * @param {string} level - Controls how far to zoom in or out.
     * @param {string} val - the value to set the setting to.
     * @return {Promise} The result of the callback
     */
    static updateZoom(level) {
        return this.updateSetting('zoom', level);
    }

    /**
     * Get or create an Observable stream of all label updates from the visualization.
     * <p>
     * The Observable returned by this method emits inner Observables, where each
     * inner Observable is tied to the lifetime of the label for which it was created.
     * </p><p>
     * For each label rendered in the visualization, the Observable returned by this
     * method will create and emit a new inner Observable. The inner Observable will
     * emit events when the label changes. For example, if the user clicks on the label,
     * or the label changes position because of a pan/zoom, the inner Observable will
     * emit an event.
     * </p><p>
     * The inner Observable for a label will complete if the label is removed from the screen.
     * </p><p>
     * @method Graphistry.labelUpdates
     * @static
     * @return {Observable<Observable<LabelEvent>>} An Observable of inner Observables, where each
     * inner Observable represents the lifetime of a label in the visualization.
     */
    static labelUpdates() {
        return this.labelsStream || (this.labelsStream = this
            .fromEvent(window, 'message')
            .pluck('data')
            .filter((data) => data && data.type === 'labels-update')
            .multicast(() => new ReplaySubject(1))
            .let((connectable) => connectable.connect() && connectable.refCount())
            .scan((memo, { labels, simulating, semanticZoomLevel }) => {

                labels = labels || [];
                const updates = [], newSources = [];
                const labelsById = Object.create(null);
                const nextSources = Object.create(null);
                const { sources, prevLabelsById } = memo;
                let idx = -1, len = labels.length, label;

                while (++idx < len) {
                    let source;
                    label = labels[idx];
                    const { id } = label;

                    if (id in sources) {
                        source = sources[id];
                        delete sources[id];
                        if (memo.simulating !== simulating ||
                            memo.semanticZoomLevel !== semanticZoomLevel ||
                            !shallowEqual(prevLabelsById[id], label)) {
                            updates.push({ ...label, simulating, semanticZoomLevel, tag: 'updated' });
                        }
                    } else {
                        newSources.push(source = new ReplaySubject(1));
                        updates.push({ ...label, simulating, semanticZoomLevel, tag: 'added' });
                        source.key = id;
                    }

                    labelsById[id] = label;
                    nextSources[id] = source;
                }

                for (const id in sources) {
                    sources[id].complete();
                }

                idx = -1;
                len = updates.length;
                while (++idx < len) {
                    label = updates[idx];
                    nextSources[label.id].next(label);
                }

                return {
                    newSources,
                    simulating,
                    semanticZoomLevel,
                    sources: nextSources,
                    prevLabelsById: labelsById
                };
            }, {
                newSources: [],
                sources: Object.create(null),
                prevLabelsById: Object.create(null),
            })
            .mergeMap(({ newSources }) => newSources)
        );
    }

    /**
     * Subscribe to label change and exit events
     * @method Graphistry.subscribeLabels
     * @static
     * @param {subscriptions} subscriptions - A list of subscriptions that
     * will subscribe to any label updates
     * @return {Subscription} The result of the callback
     */
    static subscribeLabels({ onChange, onExit }) {
        return this.labelUpdates().mergeMap((group) => group
            .do((event) => onChange && onChange(event))
            .takeLast(1)
            .do((event) => onExit && onExit(event))
        )
        .subscribe();
    }
}

/**
 * Function that creates a Graphistry Wrapped IFrame
 * @func GraphistryJS
 * @param {Object} IFrame - An IFrame that incudes a Graphistry visualization.
 * @return {Graphistry}
 * @example
 *
 * <iframe id="viz" src="http://127.0.0.1:10000/graph/graph.html?dataset=Miserables" />
 * <script>
 * document.addEventListener("DOMContentLoaded", function () {
 *
 *     GraphistryJS(document.getElementById('viz'))
 *         .flatMap(function (g) {
 *             window.g = g;
 *             document.getElementById('controls').style.opacity=1.0;
 *             console.log('opening filters');
 *             return g.openFilters();
 *         })
 *         .delay(5000)
 *         .flatMap(function() {
 *             console.log('filters opened');
 *             const columns = [
 *                 ['edge', 'highways', [66, 101, 280], 'number'],
 *                 ['point', 'theme parks', ['six flags', 'disney world', 'great america'], 'string']
 *             ];
 *             console.log('adding columns', columns);
 *             return g.addColumns.apply(g, columns);
 *        })
 *         .subscribe(function (result) {
 *             console.log('all columns: ', result);
 *         });
 * });
 * </script>
 *
 */
function GraphistryJS(iFrame) {

    if (!iFrame) {
        throw new Error('No iframe provided to Graphistry');
    }

    const model = new Model({
        recycleJSON: true,
        scheduler: Scheduler.async,
        allowFromWhenceYouCame: true
    });

    model._source = new PostMessageDataSource(
        window, iFrame.contentWindow, model
    );

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

Graphistry = wrapStaticObservableMethods(Observable, Graphistry);

export { GraphistryJS };
// export default GraphistryJS;

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
    Graphistry.bindNodeCallback = (...args) => (...args2) => new Graphistry(Observable.bindNodeCallback(...args)(...args2));
    return Graphistry;
}

/**
 * A LabelEvent is dispatched by the inner Observables emitted by the labelUpdates() Observable.
 * A LabelEvent is generated for each label update in the visualization.
 * @typedef {Object} LabelEvent
 * @property {number} id - the integer ID for the element the label describes
 * @property {String} tag - a string that describes the update kind, either 'added' or 'updated'
 * @property {String} type - the graph component type for the element the label describes, either 'edge' or 'point'
 * @property {number} size - the size in pixels of the element the label describes. This is 0 for edges, and the diameter for points
 * @property {number} pageX - the pageX of the element the label describes
 * @property {number} pageY - the pageY of the element the label describes
 * @property {boolean} selected - a boolean that describes whether element the label describes is selected
 * @property {boolean} highlight - a boolean that describes whether element the label describes is highlighted
 * @property {boolean} simulating - a boolean that indicates the visualization is running clustering
 * @property {number} semanticZoomLevel - the semantic zoom level of the visualization
 */

/**
 * @constructor Observable
 * @see {@link https://github.com/ReactiveX/rxjs/blob/master/doc/observable.md}
 */

 /**
 * The subscribe method triggers the execution of the Observable, causing the values within to be pushed to a callback. An Observable is like a pipe of water that is closed. When subscribe is called, we open the valve and the values within are pushed at us.  These values can be received using either callbacks or an {@link Observer} object.
 * @name subscribe
 * @memberof Observable.prototype
 * @function
 * @arg {?Observable~nextCallback} next a callback that accepts the next value in the stream of values
 * @arg {?Observable~errorCallback} error a callback that accepts an error that occurred while evaluating the operation underlying the {@link Observable} stream
 * @arg {?Observable~completeCallback} completed a callback that is invoked when the {@link Observable} stream has ended, and the {@link Observable~nextCallback} will not receive any more values
 * @return {Subscription}
 */

/**
 * This callback accepts a value that was emitted while evaluating the operation underlying the {@link Observable} stream.
 * @callback Observable~nextCallback
 * @param {Object} value the value that was emitted while evaluating the operation underlying the {@link Observable}
 */

/**
 * This callback accepts an error that occurred while evaluating the operation underlying the {@link Observable} stream. When this callback is invoked, the {@link Observable} stream ends and no more values will be received by the {@link Observable~nextCallback}.
 * @callback Observable~errorCallback
 * @param {Error} error the error that occurred while evaluating the operation underlying the {@link Observable}
 */

 /**
 * This callback is invoked when the {@link Observable} stream ends. When this callback is invoked the {@link Observable} stream has ended, and therefore the {@link Observable~nextCallback} will not receive any more values.
 * @callback Observable~completeCallback
 */

/**
 * @constructor Subscription
 * @see {@link https://github.com/ReactiveX/rxjs/blob/master/doc/subscription.md}
 */

/**
 * When this method is called on the Subscription, the Observable that created the Subscription will stop sending values to the callbacks passed when the Subscription was created.
 * @name unsubscribe
 * @method
 * @memberof Subscription.prototype
 */
