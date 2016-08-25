'use strict';

import $ from 'jquery'
import { Observable, ReplaySubject } from 'rxjs';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:dataInspector');
var _       = require('underscore');
var Backbone = require('backbone');
    Backbone.$ = $;
    Backbone.PageableCollection = require('backbone.paginator');
var Backgrid = require('backgrid');
    require('@graphistry/backgrid-paginator');
    require('backgrid-filter');


const util        = require('./util.js');
const VizSlice    = require('./VizSlice.js');
const contentFormatter = require('./contentFormatter.js');
const Command     = require('./command.js');

const ROWS_PER_PAGE = 8;


function init (appState, socket, workerUrl, marquee, filtersResponses, isOnSubject) {
    const $nodesInspector = $('#inspector-nodes').find('.inspector');
    const $edgesInspector = $('#inspector-edges').find('.inspector');

    const marqueeTriggers = marquee.selections.merge(marquee.doneDragging);

    //////////////////////////////////////////////////////////////////////////
    // Interactions with other tools.
    //////////////////////////////////////////////////////////////////////////

    const $inspectorOverlay = $('#inspector-overlay');
    // Grey out data inspector when marquee is being dragged.
    appState.brushOn.do((state) => {
        // TODO: Don't rely on CSS state here.
        if (state === 'dragging' && $('#inspector').css('visibility') === 'visible') {
            $inspectorOverlay.css('visibility', 'visible');
        } else {
            $inspectorOverlay.css('visibility', 'hidden');
        }
    }).subscribe(_.identity, util.makeErrorHandler('Grey / Ungrey Data Inspector'));

    //////////////////////////////////////////////////////////////////////////
    // Setup Inspector
    //////////////////////////////////////////////////////////////////////////


    // Grab header.
    const inspectHeaderCommand = new Command('Inspect header', 'inspect_header', socket, false);
    inspectHeaderCommand.sendWithObservableResult(null)
    .map((data) => ({
        nodes: {
            columns: createColumns(data.header.nodes, 'Node'),
            urn: data.urns.nodes
        },
        edges: {
            columns: createColumns(data.header.edges, 'Edge'),
            urn: data.urns.edges
        }
    })).map((data) => ({
        nodes: initPageableGrid(workerUrl, data.nodes.columns, data.nodes.urn, $nodesInspector, appState.activeSelection, 1),
        edges: initPageableGrid(workerUrl, data.edges.columns, data.edges.urn, $edgesInspector, appState.activeSelection, 2)
    })).do((grids) => {

        // Now that we have grids, we need to process updates.
        // TODO: This triggers on simulate, when it shouldn't have to (should it?)
        Observable.combineLatest(marqueeTriggers, filtersResponses, isOnSubject, (sel, filters, isOn) => ({
            sel: sel, filters: filters, isOn: isOn
        })).filter((data) => {
            // Filter so it only triggers a fetch when inspector is visible.
            return data.isOn;
        }).do((data) => {
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
        editable: false
    }].concat(_.map(_.without(header, '_title'), (key) => ({
        name: key,
        label: key,
        cell: 'string',
        editable: false
    })));
}

function updateGrid(grid, sel) {
    grid.collection.queryParams.sel = sel;
    grid.collection.fetch({reset: true});
}

function initPageableGrid(workerUrl, columns, urn, $inspector, activeSelection, dim) {

    //////////////////////////////////////////////////////////////////////////
    // Setup Backbone Views and Models
    //////////////////////////////////////////////////////////////////////////

    const SelectableRow = Backgrid.Row.extend({
        mouseoverColor: 'lightblue',
        activeColor: '#0FA5C5',
        events: {
            click: 'rowClick'
        },

        // Give pointer back to view from model.
        // TODO FIXME: This doesn't fire because it has a typo; but fixing it causes backgrid.cells to be undefined.
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
            const ctrl = evt.ctrlKey || evt.metaKey;
            const shift = evt.shiftKey;
            const selection = {idx: +this.model.attributes._index, dim: dim, source: 'dataInspector'};
            if (ctrl) {
                // TODO: Is there a cleaner way to do this sort of "in place"
                // operation on a replay subject?
                activeSelection.take(1).do((sel) => {
                    activeSelection.onNext(sel.removeOrAdd(selection));
                }).subscribe(_.identity, util.makeErrorHandler('Multiselect in dataInspector'));
            } else if (shift) {
                activeSelection.take(1).do((sel) => {
                    if (sel.isEmpty()) {
                        sel = sel.newFrom([selection]);
                    } else {
                        //const newRangeStart = sel[sel.length - 1];
                        const newRange = [];
                        sel = sel.newAdding(newRange);
                    }
                    activeSelection.onNext(sel);
                }).subscribe(_.identity, util.makeErrorHandler('Multiselect range in dataInspector'));
            } else {
                let newSelection;
                if (this.model.get('selected')) {
                    newSelection = new VizSlice();
                } else {
                    newSelection = new VizSlice([selection]);
                }
                activeSelection.onNext(newSelection);
            }
        }
    });

    const InspectData = Backbone.Model.extend({});
    const DataFrame = Backbone.PageableCollection.extend({
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
            // Transform response values for presentation.
            _.each(resp.values, (rowContents) => {
                _.each(_.keys(rowContents), (attrName) => {
                    const dataType = resp.dataTypes[attrName];
                    const formatted = contentFormatter.defaultFormat(rowContents[attrName], dataType);
                    rowContents[attrName] = formatted;
                });
            });

            return resp.values;
        }
    });

    const dataFrame = new DataFrame([], {mode: 'server'});

    const grid = new Backgrid.Grid({
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
        _.each(grid.body.rows, (row) => {
            // TODO: Kill this hack.
            if (!row.model) {
                return;
            }
            row.model.set('selected', false);
            if (grid.selection.containsIndexByDim(+row.model.attributes._index, dim)) {
                grid.selectedModels.push(row.model);
                row.model.set('selected', true);
            }
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

    const paginator = new Backgrid.Extension.Paginator({
        windowSize: 20, // Default is 10
        collection: dataFrame
    });

    // TODO: Use templates for this stuff instead of making in jquery.
    const divider = $('<div>').addClass('divide-line');
    const paginatorEl = paginator.render().el;

    $inspector.prepend(divider);
    $inspector.append(paginatorEl);

    setupSelectionRerender(activeSelection, grid, dim);
    setupSearchBar(columns[0].label, dataFrame, $inspector, workerUrl, dim);

    const $colHeaders = $inspector.find('.backgrid').find('thead').find('tr').children();
    $colHeaders.each(() => {
        const $colHeader = $(this);
        $colHeader.click(() => {
            $colHeaders.not($colHeader).each(() => {
                $(this).removeClass('ascending').removeClass('descending');
            });
        });
    });

    return grid;
}


function setupSelectionRerender(activeSelection, grid, whichDim) {
    activeSelection.do((selection) => {
        grid.selectedModels = [];
        grid.selection = selection;

        _.each(grid.body.rows, (row) => {
            // Guard against initialization issues.
            // TODO: Figure out instantiation order.
            if (!row.model) {
                return;
            }
            row.model.set('selected', false);
            selection.forEachIndexAndDim((idx, dim) => {
                if ((+row.model.attributes._index) === idx && whichDim === dim) {
                    grid.selectedModels.push(row.model);
                    row.model.set('selected', true);
                }
            });
            row.userRender();
        });
    }).subscribe(_.identity, util.makeErrorHandler('Render active selection in data inspector'));
}


function setupSearchStreams(searchRequests) {

    util.bufferUntilReady(searchRequests).do((hash) => {
        const req = hash.data;

        if (Backbone.PageableCollection &&
                req.collection instanceof Backbone.PageableCollection) {
            req.collection.getFirstPage({data: req.data, reset: true, fetch: true, success: hash.ready});
        } else {
            req.collection.fetch({data: req.data, reset: true, success: hash.ready});
        }
    }).subscribe(_.identity, util.makeErrorHandler('dataInspector search stream'));
}


function setupSearchBar(searchField, dataFrame, $inspector, workerUrl, dim) {

    const serverSideFilter = new Backgrid.Extension.ServerSideFilter({
        collection: dataFrame,
        name: 'search',
        placeholder: 'Search ' + searchField + 's'
    });

    //////////////////////////////////////////////////////////////////////
    // Attach Autosearch Handlers
    //////////////////////////////////////////////////////////////////////

    const searchRequests = new ReplaySubject(1);

    const attemptSearch = function (e) {
        // Because we clobber the handler for this.
        this.showClearButtonMaybe();
        this.search(e);
    };

    // Copied / modified the filter extension. We're overriding here to
    // allow it to debounce itself.
    // TODO: Decide if we should fork, or otherwise extend cleaner.
    const search = function (e) {
        if (e) {
            e.preventDefault();
        }

        const data = {};
        const query = this.query();
        if (query) {
            data[this.name] = query;
        }
        searchRequests.onNext({
            data: data,
            collection: this.collection
        });
    };

    setupSearchStreams(searchRequests);

    // Hook up new event handlers
    serverSideFilter.events = _.extend(serverSideFilter.events, {
        'keyup input[type=search]': 'attemptSearch'
    });
    serverSideFilter.attemptSearch = attemptSearch;
    serverSideFilter.search = search;
    serverSideFilter.delegateEvents();

    const filterEl = serverSideFilter.render().el;

    // Add an export button to bar

    const exportUrl = 'export_csv';
    const type = (dim === 2) ? 'edge' : 'point';
    const href = workerUrl + exportUrl + '?type=' + type;
    const $exportButton = $('<a href="' + href + '" target="_blank" download class="csvExportButton pull-right btn btn-xs btn-default" id="csvExportButton' + dim + '">' +
        '<span class="glyphicon glyphicon-cloud-download"></span>' +
        'Download ' + searchField.toLowerCase() + ' table as CSV' +
        '</a>');
    $(filterEl).append($exportButton);

    // Attach element to inspector.
    $inspector.prepend(filterEl);

}



module.exports = {
    init: init
};

