'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;

var d3 = require('d3');
var Command = require('../command.js');
var util    = require('../util.js');
var FilterControl = require('../FilterControl.js');
var Identifier = require('../Identifier');
var contentFormatter = require('../contentFormatter.js');
var ExpressionEditor    = require('../expressionEditor.js');

var timeExplorerUtils = require('./timeExplorerUtils.js');

//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var timeAggregationButtons = [
    {shortValue: 'D', longValue: 'day', active: true},
    {shortValue: 'H', longValue: 'hour'},
    {shortValue: 'M', longValue: 'minute'},
    {shortValue: 'S', longValue: 'second'}
];

var TIME_BAR_HEIGHT = 60;
var MIN_COLUMN_WIDTH = 6;
var BAR_SIDE_PADDING = 1;

var color = d3.scale.ordinal()
        .range(['#A2A2A2', '#828282', '#6FC4D6', '#479BAD'])
        .domain(['user', 'userFocus', 'main', 'mainFocus']);

var margin = {
    top: 15,
    right: 10,
    bottom: 2,
    left: 10
};

//////////////////////////////////////////////////////////////////////////////
// Backbone
//////////////////////////////////////////////////////////////////////////////

var TimeBarModel = Backbone.Model.extend({});

var TimeBarView = Backbone.View.extend({
    tagName: 'div',
    className: 'timeBarDiv',

    events: {
        'click .timeAggButton': 'changeTimeAgg'
    },

    initialize: function () {

        this.barModelSubject = this.model.get('barModelSubject');
        this.dataModelSubject = this.model.get('dataModelSubject');
        this.newDataAndRenderSubject = new Rx.ReplaySubject(1);
        this.setupRenderRequestHandler();

        this.dataModelDiffer = timeExplorerUtils.makeDataModelDiffer('timeBarDataModelDiffer');
        this.barModelDiffer = timeExplorerUtils.makeDataModelDiffer();

        this.listenTo(this.model, 'destroy', this.remove);
        // this.listenTo(this.model, 'change:timeStamp', this.newContent);
        // TODO: listen to changes and render

        this.barModelSubject.take(1).do((barModel) => {
            var params = {};
            if (barModel.showTimeAggregationButtons) {
                params.timeAggregationButtons = timeAggregationButtons;
            }

            this.template = Handlebars.compile($('#timeBarTemplate').html());
            var html = this.template(params);
            this.$el.html(html);
            this.$el.attr('cid', this.cid);

            // TODO FIXME
            // Use showTimeAggButtons to signify bottom bar
            if (!barModel.showTimeAggregationButtons) {

                // Setup expression editor
                this.$expressionArea = this.$('.filterExpression');
                this.editor = new ExpressionEditor(this.$expressionArea[0]);
                this.editor.setReadOnly(false);
                this.editor.dataframeCompleter.setNamespaceMetadata(this.model.get('metadata'));

                // TODO FIXME These should be params to the expression editor constructor, not done after the fact
                this.editor.editor.setOptions({
                    minLines: 1,
                    maxLines: 1
                });

                // Make special enter submit command:
                this.editor.editor.commands.addCommand({
                    name: 'enterHandler',
                    bindKey: {win: 'enter',  mac: 'enter'},
                    exec: (editor) => {
                        var queryString = editor.getValue();
                        var {type, attr} = timeExplorerUtils.getAttributeInfoFromQueryString(queryString);
                        var query = FilterControl.prototype.queryFromExpressionString(queryString);
                        this.updateBarFilter({type, attribute: attr, query});
                    }
                });

            }

            this.listenForUpdates();

        }).subscribe(_.identity, util.makeErrorHandler('getting bar model for time bar'));
    },

    updateBarFilter: function (filterDesc) {

        this.barModelSubject.take(1).do((barModel) => {
            var newModel = _.clone(barModel);
            newModel.filter = filterDesc;

            this.barModelSubject.onNext(newModel);
        }).subscribe(_.identity, util.makeErrorHandler('updating bar filter'));

    },

    listenForUpdates: function () {

        Rx.Observable.combineLatest(this.barModelSubject,
            this.dataModelSubject,
            (barModel, dataModel) => {
                var changedBarKeys = this.barModelDiffer(barModel);
                var changedDataKeys = this.dataModelDiffer(dataModel);
                var enrichedBar = {
                    model: barModel,
                    changedKeys: changedBarKeys
                };
                var enrichedData = {
                    model: dataModel,
                    changedKeys: changedDataKeys
                };
                return {
                    bar: enrichedBar,
                    data: enrichedData
                };
            }
        )
        .do((updates) => {
            var {bar, data} = updates;

            // TODO: Generalize requirements to render
            // check if data model has requisite fields and return if not
            var hasFields = data.model.timeAttr && data.model.timeType && data.model.timeAggregationMode &&
                        data.model.localTimeBounds;
            if (!hasFields) {
                return;
            }

            // Fetch new data and rerender
            if (_.intersection(data.changedKeys, ['localTimeBounds', 'timeAttr', 'timeType', 'timeAggregationMode']).length > 0
                || _.intersection(bar.changedKeys, ['filter', 'attr', 'binContentType']).length > 0
            ) {

                // TODO: Replace this
                this.model.set('lineUnchanged', false);

                this.requestNewDataAndRender({
                    data, bar
                });

                return;
            }

            // Mouse moved, render mouseover effects
            if (_.intersection(data.changedKeys, ['mouseX']).length > 0) {

                // TODO FIXME LAZY HACK
                this.lastBarModel = bar.model;
                this.lastDataModel = data.model;

                this.renderMouseEffects(bar.model, data.model);
            }


        }).subscribe(_.identity, util.makeErrorHandler('listening for updates time bar'));

    },

    setupRenderRequestHandler: function () {
        this.newDataAndRenderSubject.inspectTime(timeExplorerUtils.ZOOM_POLL_RATE)
            .flatMap((req) => {
                return this.getServerTimeDataObservable(req.data.model, req.bar.model).take(1).map((serverData) => {
                    return {
                        req,
                        serverData
                    }
                });
            }).do((data) => {
                var {req, serverData} = data;

                var newModel = _.clone(req.bar.model);
                newModel.serverData = serverData;
                this.barModelSubject.onNext(newModel);

                // TODO FIXME LAZY HACK:
                this.lastBarModel = newModel;
                this.lastDataModel = req.data.model;

                this.render(newModel, req.data.model);
            }).subscribe(_.identity, util.makeErrorHandler('fetching data for time bar'));
    },

    requestNewDataAndRender: function (req) {
        this.newDataAndRenderSubject.onNext(req);
    },

    getServerTimeDataObservable: function (dataModel, barModel) {

        var explorer = this.model.get('explorer')

        var {timeType, timeAttr, timeAggregationMode} = dataModel;
        var {start, stop} = dataModel.localTimeBounds;
        var otherFilter = barModel.filter;

        var combinedAttr = '' + Identifier.clarifyWithPrefixSegment(timeAttr, timeType);
        var timeFilterQuery = combinedAttr + ' >= ' + start + ' AND ' + combinedAttr + ' <= ' + stop;

        var timeFilter = {
            type: timeType,
            attribute: timeAttr,
            query: FilterControl.prototype.queryFromExpressionString(timeFilterQuery)
        };

        var filters = [timeFilter];
        if (otherFilter.type && otherFilter.attribute && otherFilter.query) {
            filters.push(otherFilter);
        }

        var payload = {
            start,
            stop,
            timeType,
            timeAttr,
            timeAggregation: timeAggregationMode,
            filters
        };

        return explorer.getTimeDataCommand.sendWithObservableResult(payload).take(1)
            .map(function (resp) {
                resp.data.name = name;
                return resp.data;
            });
    },

    renderMouseEffects: function (barModel, dataModel) {

        var model = this.model;

        // Don't do anything, you haven't been populated yet
        if (!barModel.serverData) {
            return this;
        }

        // Don't do first time work.
        // TODO: Should this be initialize instead?
        if (model.get('initialized')) {
            updateTimeBarMouseover(model.get('vizContainer'), model, barModel, dataModel);
            return this;
        }
    },

    render: function (barModel, dataModel) {

        var model = this.model;

        // Don't do anything, you haven't been populated yet
        if (!barModel || !barModel.serverData) {
            return this;
        }

        // Don't do first time work.
        // TODO: Should this be initialize instead?
        if (model.get('initialized')) {
            updateTimeBar(model.get('vizContainer'), model, barModel, dataModel);
            return this;
        }

        // Need to init svg and all that.
        model.set('$el', this.$el);
        var vizContainer = this.$el.children('.vizContainer');
        vizContainer.empty();
        model.set('vizContainer', vizContainer);
        var vizHeight = '' + TIME_BAR_HEIGHT + 'px';
        vizContainer.height(vizHeight);
        initializeTimeBar(vizContainer, model, barModel, dataModel);
        updateTimeBar(vizContainer, model, barModel, dataModel);

        model.set('initialized', true);
        return this;
    },

    // mousemoveParent: function (evt) {
    //     this.model.set('pageX', evt.pageX);
    //     this.model.set('pageY', evt.pageY);
    //     this.renderMouseEffects();
    // },

    // mouseoutParent: function (/*evt*/) {
    //     this.model.set('pageX', -1);
    //     this.model.set('pageY', -1);
    //     this.renderMouseEffects();
    // },

    getBinForPosition: function (pageX) {
        return getActiveBinForPosition(this.$el, this.model, pageX, this.lastBarModel, this.lastDataModel);
    },

    getPercentageForPosition: function (pageX) {
        return getPercentageForPosition(this.$el, this.model, pageX, this.lastBarModel, this.lastDataModel);
    },

    changeTimeAgg: function (evt) {
        evt.preventDefault();
        evt.stopPropagation();

        var target = evt.target;
        var shortText = $(target).text();
        $(target).parent().children('button').not('#timeAggButton-' + shortText).removeClass('active');
        $(target).addClass('active');
        var aggValue = $(target).data('aggregation-value');

        this.dataModelSubject.take(1).do((model) => {
            var newModel = _.clone(model);
            newModel.timeAggregationMode = aggValue;
            this.dataModelSubject.onNext(newModel);
        }).subscribe(_.identity, util.makeErrorHandler('change time agg timebar'));

    },

    close: function () {

    }
});

//////////////////////////////////////////////////////////////////////////////
// D3 Rendering
//////////////////////////////////////////////////////////////////////////////


function initializeTimeBar ($el, model) {
    // debug('initializing time bar: ', model);
    // debug('$el: ', $el);
    // debug('$el sizes: ', $el.width(), $el.height());

    var width = $el.width() - margin.left - margin.right;
    var height = $el.height() - margin.top - margin.bottom;
    var d3Data = {};
    model.set('d3Data', d3Data);

    var svg = timeExplorerUtils.setupSvg($el[0], margin, width, height);

    _.extend(d3Data, {
        svg: svg,
        width: width,
        height: height
    });
}

function getPercentageForPosition ($el, model, pageX, barModel, dataModel) {

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    if (!width) {
        width = $el.width() - margin.left - margin.right;
    }
    var svg = d3Data.svg;

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }
    var adjustedX = pageX - svgOffset.left;

    var percentage = adjustedX / width;
    // Guard percentage
    percentage = Math.max(0, percentage);
    percentage = Math.min(1, percentage);
    return percentage;
}


function getActiveBinForPosition ($el, model, pageX, barModel, dataModel) {
    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    if (!width) {
        width = $el.width() - margin.left - margin.right;
    }
    var data = barModel.serverData;
    var svg = d3Data.svg;
    var xScale = timeExplorerUtils.setupBinScale(width, data.numBins, data);

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }
    var adjustedX = pageX - svgOffset.left;

    var activeBin = Math.floor(xScale.invert(adjustedX));
    return activeBin;
}

function tagBins (rawBins, keys, cutoffs) {
    var taggedBins = _.map(rawBins, function (v, i) {
        return {
            binVal: v,
            key: keys[i],
            cutoff: cutoffs[i]
        };
    });

    return taggedBins;
}

// TODO MAKE THIS USE BAR MODEL DATA MODEL, and all other update methods
function updateTimeBarMouseover ($el, model, barModel, dataModel) {

    var d3Data = model.get('d3Data');
    // var data = model.get('data');
    var data = barModel.serverData;
    var maxBinValue = data.maxBin;
    // var maxBinValue = model.get('maxBinValue');
    var barType = model.get('barType');

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    if (d3Data.lastDraw === 'lineChart') {
        updateTimeBarLineChartMouseover($el, model, barModel, dataModel);
        return;
    }

    //////////////////////////////////////////////////////////////////////////
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    var pageX = dataModel.mouseX;
    // var pageX = model.get('pageX');
    var activeBin = getActiveBinForPosition($el, model, pageX, barModel, dataModel);
    var upperTooltipValue = data.bins[activeBin];

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }
    var adjustedX = pageX - svgOffset.left;

    upperTooltip.attr('x', adjustedX + 4)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .classed('upperTooltip', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .attr('pointer-events', 'none')
        .text('');


    //////////////////////////////////////////////////////////////////////////
    // Update Moving Date Indicator (if main bar)
    //////////////////////////////////////////////////////////////////////////

    if (barType === 'main') {

        var dateTooltip = svg.selectAll('.dateTooltip');
        var dateTooltipValue = data.cutoffs[activeBin];
        dateTooltipValue = contentFormatter.defaultFormat(dateTooltipValue, 'date');

        dateTooltip.attr('x', adjustedX - 3)
            .text(dateTooltipValue);

        dateTooltip.data([''])
            .enter().append('text')
            .classed('dateTooltip', true)
            .classed('unselectable', true)
            .attr('y', -5)
            .attr('x', 0)
            .attr('text-anchor', 'end')
            .attr('opacity', 1.0)
            .attr('font-size', '0.7em')
            .attr('pointer-events', 'none')
            .text('');

    }


    //////////////////////////////////////////////////////////////////////////
    // Update Bar Colors
    //////////////////////////////////////////////////////////////////////////


    var recolorBar = function (d) {
        if (d.idx === activeBin) {
            return color(barType + 'Focus');
        } else {
            return color(barType);
        }
    };

    var columns = svg.selectAll('.column');

    var bars = columns.selectAll('.bar-rect')
        .style('fill', recolorBar);
}


function updateTimeBarLineChartMouseover ($el, model, barModel, dataModel) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    // var data = model.get('data');
    var data = barModel.serverData;
    var barType = model.get('barType');

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    //////////////////////////////////////////////////////////////////////////
    // Upper Tooltip
    //////////////////////////////////////////////////////////////////////////

    var upperTooltip = svg.selectAll('.upperTooltip');
    // var pageX = model.get('pageX');
    var pageX = dataModel.mouseX;
    var activeBin = getActiveBinForPosition($el, model, pageX, barModel, dataModel);
    var upperTooltipValue = data.bins[activeBin];

    var svgOffset = d3Data.svgOffset;
    if (!svgOffset) {
        var jquerySvg = $(svg[0]);
        svgOffset = jquerySvg.offset();
        d3Data.svgOffset = svgOffset;
    }

    var adjustedX = pageX - svgOffset.left;

    upperTooltip.attr('x', adjustedX + 4)
        .text(upperTooltipValue);

    upperTooltip.data([''])
        .enter().append('text')
        .classed('upperTooltip', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 0)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .attr('pointer-events', 'none')
        .text('');

    //////////////////////////////////////////////////////////////////////////
    // Update Moving Date Indicator (if main bar)
    //////////////////////////////////////////////////////////////////////////

    if (barType === 'main') {

        var dateTooltip = svg.selectAll('.dateTooltip');
        var dateTooltipValue = data.cutoffs[activeBin];
        dateTooltipValue = contentFormatter.defaultFormat(dateTooltipValue, 'date');

        dateTooltip.attr('x', adjustedX - 3)
            .text(dateTooltipValue);

        dateTooltip.data([''])
            .enter().append('text')
            .classed('dateTooltip', true)
            .classed('unselectable', true)
            .attr('y', -5)
            .attr('x', 0)
            .attr('text-anchor', 'end')
            .attr('opacity', 1.0)
            .attr('font-size', '0.7em')
            .attr('pointer-events', 'none')
            .text('');

    }

}


function updateTimeBar ($el, model, barModel, dataModel) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    // var data = model.get('data');
    var data = barModel.serverData;
    var maxBinValue = data.maxBin;
    var taggedBins = tagBins(data.bins, data.keys, data.cutoffs);

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    // Draw as time series if too many
    if ((width/MIN_COLUMN_WIDTH) < data.numBins) {
        updateTimeBarLineChart($el, model, barModel, dataModel);
        d3Data.lastDraw = 'lineChart';
        return;
    }

    // Reset if line Chart
    if (d3Data.lastDraw === 'lineChart') {
        svg.selectAll("*").remove();
    }

    var barType = model.get('barType');

    var xScale = timeExplorerUtils.setupBinScale(width, data.numBins, data);
    var yScale = timeExplorerUtils.setupAmountScale(height, maxBinValue, data.bins);

    // var barWidth = Math.floor(width/data.numBins) - BAR_SIDE_PADDING;

    //////////////////////////////////////////////////////////////////////////
    // Compute mouse position values
    //////////////////////////////////////////////////////////////////////////



    // var pageX = model.get('pageX');
    var pageX = dataModel.mouseX;
    var activeBin = getActiveBinForPosition($el, model, pageX, barModel, dataModel);

    var recolorBar = function (d) {
        if (d.idx === activeBin) {
            return color(barType + 'Focus');
        } else {
            return color(barType);
        }
    };


    //////////////////////////////////////////////////////////////////////////
    // Make Line Beneath
    //////////////////////////////////////////////////////////////////////////
    var lineDimensions = {
        x1: 0,
        y1: height,
        x2: width,
        y2: height
    };

    var lines = svg.selectAll('.line')
        .data([lineDimensions]);

    lines.enter().append('line')
        .classed('line', true)
        .style('stroke', 'black')
        .attr('x1', function (d) {
            return d.x1;
        })
        .attr('x2', function (d) {
            return d.x2;
        })
        .attr('y1', function (d) {
            return d.y1;
        })
        .attr('y2', function (d) {
            return d.y2;
        });

    //////////////////////////////////////////////////////////////////////////
    // Name Caption
    //////////////////////////////////////////////////////////////////////////

    var nameCaption = svg.selectAll('.nameCaption');
    nameCaption.data([''])
        .enter().append('text')
        .classed('nameCaption', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 5)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text(data.name);

    //////////////////////////////////////////////////////////////////////////
    // Compute widths in pixels
    //////////////////////////////////////////////////////////////////////////

    var sumOfWidths = _.reduce(data.widths, function (memo, num) {
        return memo + num;
    }, 0);

    var baseBarWidth = Math.floor(width / sumOfWidths);

    var adjustedWidths = _.map(data.widths, function (val) {
        var base = Math.floor(baseBarWidth * val) - BAR_SIDE_PADDING;
        return Math.max(base, 1);
    });


    //////////////////////////////////////////////////////////////////////////
    // Make Columns
    //////////////////////////////////////////////////////////////////////////

    var columns = svg.selectAll('.column')
        .data(taggedBins, function (d, i) {
            return d.key;
        });

    var columnRects = columns.selectAll('.column-rect');

    columns.exit().remove();

    columns.transition().duration(timeExplorerUtils.ZOOM_UPDATE_RATE).ease('linear')
        .attr('transform', function (d, i) {
            return 'translate(' + xScale(i) + ',0)';
        });

    columnRects.transition().duration(timeExplorerUtils.ZOOM_UPDATE_RATE).ease('linear')
        .attr('width', function (d, i) {
            return Math.floor(adjustedWidths[i] + BAR_SIDE_PADDING);
        });
        // .attr('width', Math.floor(barWidth + BAR_SIDE_PADDING));

    var enterTweenTransformFunc = function (d, i) {
        return 'translate(' + xScale(i) + ',0)';
    };

    var newCols = columns.enter().append('g');

    newCols.classed('g', true)
        .classed('column', true)
        .append('rect')
            .classed('column-rect', true)
            .attr('width', function (v, i) {
                return adjustedWidths[i] + BAR_SIDE_PADDING;
            })
            // .attr('width', barWidth + BAR_SIDE_PADDING)
            .attr('height', height)
            .attr('opacity', 0);

    // Store a copy in this scope (because it'll later be updated by the time this function executes)
    var topVal = d3Data.lastTopVal;

    newCols.transition().duration(timeExplorerUtils.ZOOM_UPDATE_RATE).ease('linear')
        .attrTween('transform', function (d, i, a) {
            if (topVal && d.cutoff >= topVal) {
                return d3.interpolate('translate(' + width + ',0)', String(enterTweenTransformFunc.call(this, d, i)));
            } else {
                return d3.interpolate('translate(0,0)', String(enterTweenTransformFunc.call(this, d, i)));
            }
        });

    // TODO: Is this assignment correct?
    var bars = columns.selectAll('.bar-rect')
        // .data(data.bins);
        .data(function (d, i) {
            var params = {
                val: d.binVal,
                key: d.key,
                idx: i
            };
            return [params];
        }, function (d, i) {
            return d.key;
            // return d.idx;
        });

    bars.exit().remove();

    // var dataPlacement = (data.name === 'All') ? 'all' : 'user';

    // bars
    bars.transition().duration(timeExplorerUtils.ZOOM_UPDATE_RATE).ease('linear')
        .attr('width', function (d) {
            return adjustedWidths[d.idx];
        })
        // .attr('width', barWidth)
        .attr('fill', recolorBar)
        .attr('y', function (d) {
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    bars.enter().append('rect')
        .attr('class', 'bar-rect')
        .style('pointer-events', 'none')
        .style('opacity', 1)
        .attr('fill', recolorBar)
        .attr('width', function (d) {
            return adjustedWidths[d.idx];
        })
        // .attr('width', barWidth)
        .attr('y', function (d) {
            return height - yScale(d.val);
        })
        .attr('height', function (d) {
            return yScale(d.val);
        });

    // Handle mouse position specific parts
    updateTimeBarMouseover($el, model, barModel, dataModel);


    d3Data.lastDraw = 'barChart';
    d3Data.lastTopVal = data.topVal;
    d3Data.lastBottomVal = data.bottomVal;

}


function updateTimeBarLineChart ($el, model, barModel, dataModel) {
    // debug('updating time bar: ', model);

    var d3Data = model.get('d3Data');
    var width = d3Data.width;
    var height = d3Data.height;
    // var data = model.get('data');
    var data = barModel.serverData;
    var maxBinValue = data.maxBin;
    // var maxBinValue = model.get('maxBinValue');

    var svg = d3Data.svg;

    // Guard against no data.
    // TODO: Do this more properly
    if (!data) {
        return;
    }

    // Reset because I don't know how to do it cleanly
    if (d3Data.lastDraw === 'barChart' || (!model.get('lineUnchanged'))) {
        // debug('REMOVING');
        svg.selectAll("*").remove();
    }

    var barType = model.get('barType');

    var xScale = timeExplorerUtils.setupBinScale(width, data.numBins, data);
    var yScale = timeExplorerUtils.setupAmountScale(height, maxBinValue, data.bins);

    //////////////////////////////////////////////////////////////////////////
    // Make Line Beneath
    //////////////////////////////////////////////////////////////////////////
    var lineDimensions = {
        x1: 0,
        y1: height,
        x2: width,
        y2: height
    };

    var lines = svg.selectAll('.line')
        .data([lineDimensions]);

    lines.enter().append('line')
        .classed('line', true)
        .style('stroke', 'black')
        .attr('x1', function (d) {
            return d.x1;
        })
        .attr('x2', function (d) {
            return d.x2;
        })
        .attr('y1', function (d) {
            return d.y1;
        })
        .attr('y2', function (d) {
            return d.y2;
        });

    //////////////////////////////////////////////////////////////////////////
    // Name Caption
    //////////////////////////////////////////////////////////////////////////

    var nameCaption = svg.selectAll('.nameCaption');
    nameCaption.data([''])
        .enter().append('text')
        .classed('nameCaption', true)
        .classed('unselectable', true)
        .attr('y', -5)
        .attr('x', 5)
        .attr('opacity', 1.0)
        .attr('font-size', '0.7em')
        .text(data.name);

    //////////////////////////////////////////////////////////////////////////
    // Make Area Lines
    //////////////////////////////////////////////////////////////////////////

    var area = d3.svg.area()
        .x(function(d, i) { return xScale(i); })
        .y0(height)
        .y1(function(d) { return height - yScale(d); });

    // HACK: WAY TO AVOID REDRAW
    var areaChart = svg.selectAll('.areaChart');

    if (!model.get('lineUnchanged')) {
        svg.append('path')
            .datum(data.bins)
            .classed('areaChart', true)
            .classed('area', true)
            .attr('d', area)
            .attr('fill', function () {
                return color(barType);
            });
    }

    // Handle mouse position specific updates
    updateTimeBarLineChartMouseover($el, model, barModel, dataModel);

    model.set('lineUnchanged', true);

}


module.exports = {
    model: TimeBarModel,
    view: TimeBarView,
    margin
};
