'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:dataInspector');
var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Backbone = require('backbone');
    Backbone.$ = $;
    require('backbone.paginator');
var Backgrid = require('backgrid');
    require('backgrid-paginator');
    require('backgrid-filter');

var util        = require('./util.js');

var ROWS_PER_PAGE = 8;


function init(appState, socket, workerUrl, marquee, histogramPanelToggle, filtersResponses, isOnSubject) {
    var $nodesInspector = $('#inspector-nodes').find('.inspector');
    var $edgesInspector = $('#inspector-edges').find('.inspector');

    var marqueeTriggers = marquee.selections.merge(marquee.doneDragging);

    //////////////////////////////////////////////////////////////////////////
    // Interactions with other tools.
    //////////////////////////////////////////////////////////////////////////

    var $inspectorOverlay = $('#inspector-overlay');
    // Grey out data inspector when marquee is being dragged.
    appState.brushOn.do(function (state) {
        // TODO: Don't rely on CSS state here.
        if (state === 'dragging' && $('#inspector').css('visibility') === 'visible') {
            $inspectorOverlay.css('visibility', 'visible');
        } else {
            $inspectorOverlay.css('visibility', 'hidden');
        }
    }).subscribe(_.identity, util.makeErrorHandler('Grey / Ungrey Data Inspector'));

    // Change sizes based on whether or not histogram is open.
    // TODO: Separate this into some sort of control/window manager.
    histogramPanelToggle.do(function (histogramsOn) {
        // TODO: Why is this inversed here?
        if (!histogramsOn) {
            $('#inspector').css('width', '85%');
            $inspectorOverlay.css('width', '85%');
        } else {
            $('#inspector').css('width', '100%');
            $inspectorOverlay.css('width', '100%');
        }
    }).subscribe(_.identity, util.makeErrorHandler('change width on inspectorOverlay'));


    //////////////////////////////////////////////////////////////////////////
    // Setup Inspector
    //////////////////////////////////////////////////////////////////////////


    // Grab header.
    Rx.Observable.fromCallback(socket.emit, socket)('inspect_header', null)
    .do(function (reply) {
        if (!reply || !reply.success) {
            console.error('Server error on inspectHeader', (reply||{}).error);
        }
    }).filter(function (reply) { return reply && reply.success; })
    .map(function (data) {
        return {
            nodes: {
                columns: createColumns(data.header.nodes, 'Node'),
                urn: data.urns.nodes
            },
            edges: {
                columns: createColumns(data.header.edges, 'Edge'),
                urn: data.urns.edges
            }
        };
    }).map(function (data) {
        return {
            nodes: initPageableGrid(workerUrl, data.nodes.columns, data.nodes.urn, $nodesInspector, appState.activeSelection, 1),
            edges: initPageableGrid(workerUrl, data.edges.columns, data.edges.urn, $edgesInspector, appState.activeSelection, 2)
        };
    }).do(function (grids) {

        // Now that we have grids, we need to process updates.
        // TODO: This triggers on simulate, when it shouldn't have to (should it?)
        Rx.Observable.combineLatest(marqueeTriggers, filtersResponses, isOnSubject, function (sel, filters, isOn) {
            return {sel: sel, filters: filters, isOn: isOn};
        }).filter(function (data) {
            // Filter so it only triggers a fetch when inspector is visible.
            return data.isOn;
        }).do(function (data) {
            updateGrid(grids.nodes, data.sel);
            updateGrid(grids.edges, data.sel);
        }).subscribe(_.identity, util.makeErrorHandler('fetch data for inspector'));
    }).subscribe(_.identity, util.makeErrorHandler('fetch inspectHeader'));
}

function createColumns(header, title) {
    debug('Inspect Header', header);

    return [{
        name: '_title', // The key of the model attribute
        label: title, // The name to display in the header
        cell: 'string',
        editable: false,
    }].concat(_.map(_.without(header, '_title'), function (key) {
        return {
            name: key,
            label: key,
            cell: 'string',
            editable: false,
        };
    }));
}

function updateGrid(grid, sel) {
    grid.collection.queryParams.sel = sel;
    grid.collection.fetch({reset: true});
}

function initPageableGrid(workerUrl, columns, urn, $inspector, activeSelection, dim) {

    //////////////////////////////////////////////////////////////////////////
    // Setup Backbone Views and Models
    //////////////////////////////////////////////////////////////////////////

    var SelectableRow = Backgrid.Row.extend({
        mouseoverColor: 'lightblue',
        activeColor: '#0FA5C5',
        events: {
            click: 'rowClick'
        },

        // Give pointer back to view from model.
        // TODO: This doesn't appear to ever fire? What does backgrid do?
        initalize: function () {
            this.model.view = this;
        },

        // We can't override render, because we then clobber Backgrid's own systems.
        userRender: function () {
            if (this.model.get('selected')) {
                $(this.el).toggleClass('row-selected', true);
            } else {
                $(this.el).toggleClass('row-selected', false);
            }
        },

        rowClick: function (evt) {
            var ctrl = evt.ctrlKey || evt.metaKey;
            var selection = {idx: this.model.attributes._index, dim: dim, source: 'dataInspector'};
            if (!ctrl) {
                if (!this.model.get('selected')) {
                    activeSelection.onNext([selection]);
                } else {
                    activeSelection.onNext([]);
                }

            } else {
                // TODO: Is there a cleaner way to do this sort of "in place"
                // operation on a replay subject?
                activeSelection.take(1).do(function (sel) {
                    sel = util.removeOrAdd(sel, selection, function (a, b) {
                        // TODO: Should be some sort of "element" object with
                        // equality function.
                        return (a.idx === b.idx && a.dim === b.dim);
                    });
                    activeSelection.onNext(sel);
                }).subscribe(_.identity, util.makeErrorHandler('Multiselect in dataInspector'));
            }
        },
    });

    var InspectData = Backbone.Model.extend({});
    var DataFrame = Backbone.PageableCollection.extend({
        model: InspectData,
        url: workerUrl + urn,
        state: {
            pageSize: ROWS_PER_PAGE
        },

        parseState: function (resp) {
            return {
                totalRecords: resp.count,
                currentPage: resp.page
            };
        },

        parseRecords: function (resp) {
            return resp.values;
        }
    });

    var dataFrame = new DataFrame([], {mode: 'server'});

    var grid = new Backgrid.Grid({
        row: SelectableRow,
        columns: columns,
        collection: dataFrame,
        emptyText: 'Empty selection',
        selectedModels: [],
        selection: []
    });

    // Backgrid does some magic with how it assigns properties and initializes,
    // so I'm attaching these functions on the outside.

    grid.getSelectedModels = function () {
        return grid.selectedModels;
    };

    grid.renderRows = function () {
        grid.selectedModels = [];
        _.each(grid.body.rows, function (row) {
            // TODO: Kill this hack.
            if (!row.model) {
                return;
            }
            row.model.set('selected', false);
            _.each(grid.selection, function (sel) {
                if (row.model.attributes._index === sel.idx && dim === sel.dim) {
                    grid.selectedModels.push(row.model);
                    row.model.set('selected', true);
                }
            });
            // Seems to be racy at initialization, so guard for now.
            // TODO: Clean up so this guard isn't necessary.
            if (row.userRender) {
                row.userRender();
            }
        });
    };

    grid.listenTo(grid.collection, 'reset', grid.renderRows);

    // Render the grid and attach the root to your HTML document
    $inspector.empty().append(grid.render().el);

    var paginator = new Backgrid.Extension.Paginator({
        windowSize: 20, // Default is 10
        collection: dataFrame
    });

    // TODO: Use templates for this stuff instead of making in jquery.
    var divider = $('<div>').addClass('divide-line');
    var paginatorEl = paginator.render().el;

    $inspector.prepend(divider);
    $inspector.append(paginatorEl);

    setupSelectionRerender(activeSelection, grid, dim);
    setupSearchBar(columns[0].label, dataFrame, $inspector);

    var $colHeaders = $inspector.find('.backgrid').find('thead').find('tr').children();
    $colHeaders.each(function () {
        var $colHeader = $(this);
        $colHeader.click(function () {
            $colHeaders.not($colHeader).each(function () {
                $(this).removeClass('ascending').removeClass('descending');
            });
        });
    });

    return grid;
}


function setupSelectionRerender(activeSelection, grid, dim) {
    activeSelection.do(function (selection) {
        grid.selectedModels = [];
        grid.selection = selection;

        _.each(grid.body.rows, function (row) {
            // Guard against initialization issues.
            // TODO: Figure out instantiation order.
            if (!row.model) {
                return;
            }
            row.model.set('selected', false);
            _.each(selection, function (sel) {
                if (row.model.attributes._index === sel.idx && dim === sel.dim) {
                    grid.selectedModels.push(row.model);
                    row.model.set('selected', true);
                }
            });
            row.userRender();
        });
    }).subscribe(_.identity, util.makeErrorHandler('Render active selection in data inspector'));
}


function setupSearchStreams(searchRequests) {

    util.bufferUntilReady(searchRequests).do(function (hash) {
        var req = hash.data;

        if (Backbone.PageableCollection &&
                req.collection instanceof Backbone.PageableCollection) {
            req.collection.getFirstPage({data: req.data, reset: true, fetch: true, success: hash.ready});
        } else {
            req.collection.fetch({data: req.data, reset: true, success: hash.ready});
        }
    }).subscribe(_.identity, util.makeErrorHandler('dataInspector search stream'));
}


function setupSearchBar(searchField, dataFrame, $inspector) {

    var serverSideFilter = new Backgrid.Extension.ServerSideFilter({
        collection: dataFrame,
        name: 'search',
        placeholder: 'Search ' + searchField + 's'
    });

    //////////////////////////////////////////////////////////////////////
    // Attach Autosearch Handlers
    //////////////////////////////////////////////////////////////////////

    var searchRequests = new Rx.ReplaySubject(1);

    var attemptSearch = function (e) {
        // Because we clobber the handler for this.
        this.showClearButtonMaybe();
        this.search(e);
    };

    // Copied / modified the filter extension. We're overriding here to
    // allow it to debounce itself.
    // TODO: Decide if we should fork, or otherwise extend cleaner.
    var search = function (e) {
        if (e) {
            e.preventDefault();
        }

        var data = {};
        var query = this.query();
        if (query) {
            data[this.name] = query;
        }
        searchRequests.onNext({
            data: data,
            collection: this.collection,
        });
    };

    setupSearchStreams(searchRequests);

    // Hook up new event handlers
    serverSideFilter.events = _.extend(serverSideFilter.events, {
        'keyup input[type=search]': 'attemptSearch',
    });
    serverSideFilter.attemptSearch = attemptSearch;
    serverSideFilter.search = search;
    serverSideFilter.delegateEvents();

    // Attach element to inspector.
    var filterEl = serverSideFilter.render().el;
    $inspector.prepend(filterEl);
}



module.exports = {
    init: init
};

