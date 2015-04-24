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
            nodes: createColumns(data.header.nodes, 'Node'),
            edges: createColumns(data.header.edges, 'Edge')
        };
    }).do(function (columns) {
        marqueeTriggers.flatMap(function (sel) {
            return Rx.Observable.fromCallback(socket.emit, socket)('set_selection', sel);
        }).do(function (reply) {
            if (!reply || !reply.success) {
                console.error('Server error on set_selection', (reply||{}).error);
            }
        }).filter(function (reply) { return reply && reply.success; })
        .do(function (reply) {
            showPageableGrid(workerUrl, columns.nodes, reply.params.nodes, $nodesInspector);
            showPageableGrid(workerUrl, columns.edges, reply.params.edges, $edgesInspector);
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


function showPageableGrid(workerUrl, columns, params, $inspector) {
    var InspectData = Backbone.Model.extend({});
    var DataFrame = Backbone.PageableCollection.extend({
        model: InspectData,
        url: workerUrl + params.urn,
        state: {
            pageSize: 8,
            totalRecords: params.count,
        },
    });

    var dataFrame = new DataFrame([], {mode: 'server'});

    var grid = new Backgrid.Grid({
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

    var divider = $('<div>').addClass('divide-line');
    $inspector.prepend(divider);
    $inspector.prepend(paginator.render().el);
}

module.exports = {
    init: init
};

