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

function init(socket, workerUrl, marquee) {
    var InspectData = Backbone.Model.extend({});

    Rx.Observable.fromCallback(socket.emit, socket)('inspect_header', null)
    .do(function (reply) {
        if (!reply || !reply.success) {
            console.error('Server error on inspectHeader', (reply||{}).error);
        }
    }).filter(function (reply) { return reply && reply.success; })
    .map(function (data) {
        if (data && data.success) {
            debug('Inspect Header', data.header);
            var columns = [{
                name: '_title', // The key of the model attribute
                label: 'Node', // The name to display in the header
                cell: 'string',
                editable: false,
            }].concat(_.map(_.without(data.header, '_title'), function (key) {
                return {
                    name: key,
                    label: key,
                    cell: 'string',
                    editable: false,
                };
            }));
            return columns;
        } else {
            console.error('Server error on inspectHeader', data.error);
        }
    }).do(function (columns) {
        marquee.selections.flatMap(function (sel) {
            return Rx.Observable.fromCallback(socket.emit, socket)('set_selection', sel);
        }).do(function (reply) {
            if (!reply || !reply.success) {
                console.error('Server error on set_selection', (reply||{}).error);
            }
        }).filter(function (reply) { return reply && reply.success; })
        .subscribe(function (reply) {
            debug('Setting up PageableCollection of size', reply.count);
            showPageableGrid(workerUrl, InspectData, columns, reply.count);
        }, util.makeErrorHandler('fetch data for inspector'));
    }).subscribe(_.identity, util.makeErrorHandler('fetch inspectHeader'));
}


function showPageableGrid(workerUrl, model, columns, count) {
    var $inspector = $('#inspector');

    var DataFrame = Backbone.PageableCollection.extend({
        model: model,
        url: workerUrl + '/read_selection',
        state: {
            pageSize: 5,
            totalRecords: count,
        },
    });

    var dataFrame = new DataFrame([], {mode: 'server'});
    dataFrame.fetch({reset: true});

    var grid = new Backgrid.Grid({
        columns: columns,
        collection: dataFrame
    });

    // Render the grid and attach the root to your HTML document
    $inspector.empty().append(grid.render().el).css({visibility: 'visible'});

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

    $inspector.append(paginator.render().el);
}

module.exports = {
    init: init
};

