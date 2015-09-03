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

function init(appState, socket, workerUrl, marquee) {
    var $nodesInspector = $('#inspector-nodes').find('.inspector');
    var $edgesInspector = $('#inspector-edges').find('.inspector');

    var marqueeTriggers = marquee.selections.merge(marquee.doneDragging);

    var $inspectorOverlay = $('#inspector-overlay');
    // Grey out data inspector when marquee is being dragged.
    appState.brushOn.do(function (state) {
        if (state === 'dragging') {
            $inspectorOverlay.css('visibility', 'visible');
        } else {
            $inspectorOverlay.css('visibility', 'hidden');
        }
    }).subscribe(_.identity, util.makeErrorHandler('Grey / Ungrey Data Inspector'));


    // Update data inspector when new selections are available.
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
        marqueeTriggers.flatMap(function (sel) {
            return Rx.Observable.fromCallback(socket.emit, socket)('set_selection', sel);
        }).do(function (reply) {
            if (!reply || !reply.success) {
                console.error('Server error on set_selection', (reply||{}).error);
            }
        }).filter(function (reply) { return reply && reply.success; })
        .do(function (reply) {
            updateGrid(grids.nodes, reply.params.nodes);
            updateGrid(grids.edges, reply.params.edges);
            $('#inspector').css({visibility: 'visible'});
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

function updateGrid(grid, params) {
    grid.collection.state.totalRecords = params.count;
    grid.collection.fetch({reset: true});
}

function initPageableGrid(workerUrl, columns, urn, $inspector, activeSelection, dim) {
    console.log('SHOWING GRID');

    var SelectableRow = Backgrid.Row.extend({
        mouseoverColor: 'lightblue',
        activeColor: 'blue',
        events: {
            mouseover: 'rowMouseOver',
            mouseout: 'rowMouseOut',
            click: 'rowClick'
        },
        rowClick: function (evt) {
            if (!this.model.get('selected')) {
                this.model.set('selected', true);
                $(this.el).css('backgroundColor', this.activeColor);
                activeSelection.onNext([[this.model.attributes._index, dim]]);
            } else {
                this.model.set('selected', false);
                $(this.el).css('backgroundColor', '');
                activeSelection.onNext([]);
            }
            console.log('Clicked on: ', this);
        },
        rowMouseOver: function () {
            // $(this.el).css('backgroundColor', this.mouseoverColor);
        },
        rowMouseOut: function () {
            // $(this.el).css('backgroundColor', '');
        }
    });


    var InspectData = Backbone.Model.extend({});
    var DataFrame = Backbone.PageableCollection.extend({
        model: InspectData,
        url: workerUrl + urn,
        state: {
            pageSize: 8
        },
    });

    var dataFrame = new DataFrame([], {mode: 'server'});

    var grid = new Backgrid.Grid({
        // row: SelectableRow,
        columns: columns,
        collection: dataFrame,
        emptyText: 'Empty selection'
    });

    // Render the grid and attach the root to your HTML document
    $inspector.empty().append(grid.render().el);

    var paginator = new Backgrid.Extension.Paginator({
        // If you anticipate a large number of pages, you can adjust
        // the number of page handles to show. The sliding window
        // will automatically show the next set of page handles when
        // you click next at the end of a window.
        windowSize: 20, // Default is 10

        // Used to multiple windowSize to yield a number of pages to slide,
        // in the case the number is 5
        //slideScale: 0.25, // Default is 0.5
        collection: dataFrame
    });

    dataFrame.fetch({reset: true});

    var serverSideFilter = new Backgrid.Extension.ServerSideFilter({
        collection: dataFrame,
        name: 'search'
    });

    // TODO: Use templates for this stuff instead of making in jquery.
    var divider = $('<div>').addClass('divide-line');
    // var $controlsContainer = $('<div>').addClass('row');
    var paginatorEl = paginator.render().el;
    var filterEl = serverSideFilter.render().el;
    // $(paginatorEl).addClass('col-xs-8');
    // $(filterEl).addClass('col-xs-4');
    // $controlsContainer.append(filterEl).append(paginatorEl);

    $inspector.prepend(divider);
    // $inspector.prepend($controlsContainer);
    $inspector.append(paginatorEl);
    $inspector.prepend(filterEl);

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


module.exports = {
    init: init
};

