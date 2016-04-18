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


var timeBar = require('./timeBar.js');
var timeExplorerBottomAxis = require('./timeExplorerBottomAxis.js');
var userTimeBars = require('./userTimeBars.js');
var timeExplorerUtils = require('./timeExplorerUtils.js');

//////////////////////////////////////////////////////////////////////////////
// CONSTANTS
//////////////////////////////////////////////////////////////////////////////

var DOUBLE_CLICK_TIME = 500;
var SCROLL_SAMPLE_TIME = 5;
var INTERACTION_MODE = 'FILTER';

//////////////////////////////////////////////////////////////////////////////
// Explorer Panel
//////////////////////////////////////////////////////////////////////////////

function TimeExplorerPanel (socket, $parent, metadata, explorer) {
    var that = this;

    this.userBars = new userTimeBars.collection({explorer: explorer});

    var userBarsModel = new userTimeBars.model({explorer: explorer});
    this.userBarsView = new userTimeBars.view({explorer: explorer, collection: this.userBars, model: userBarsModel});

    var mainBarModel = new timeBar.model({explorer: explorer, timeStamp: Date.now()});
    mainBarModel.set('barModelSubject', explorer.barModelSubjects[0]);
    mainBarModel.set('dataModelSubject', explorer.dataModelSubject);
    mainBarModel.set('barType', 'main');
    mainBarModel.set('lineUnchanged', 'false');

    this.mainBarView = new timeBar.view({model: mainBarModel});
    this.bottomAxisView = new timeExplorerBottomAxis.view({model: new timeExplorerBottomAxis.model({explorer: explorer}) });

    var TimeExplorerModel = Backbone.Model.extend({});

    var TimeExplorerView = Backbone.View.extend({
        el: $parent,
        $timeExplorerBody: $('#timeExplorerBody'),
        $timeExplorerTop: $('#timeExplorerTop'),
        $timeExplorerMain: $('#timeExplorerMain'),
        $timeExplorerBottom: $('#timeExplorerBottom'),
        $timeExplorerAxisContainer: $('#timeExplorerAxisContainer'),
        $timeExplorerVizContainer: $('#timeExplorerVizContainer'),
        $timeExplorerSideInput: $('#timeExplorerSideInput'),
        $dragBox: $('#timeExplorerDragBox'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        $filterSlider: $('#time-panel-filter-slider'),
        userBarsView: that.userBarsView,
        mainBarView: that.mainBarView,
        bottomAxisView: that.bottomAxisView,

        timeBarInitializationMenuTemplate: Handlebars.compile($('#timeBarInitializationMenuTemplate').html()),

        events: {
            'mousemove #timeExplorerVizContainer': 'mousemove',
            'mouseout #timeExplorerVizContainer': 'mouseout',
            'mousedown #timeExplorerVizContainer': 'handleMouseDown',
            'click .selectTimeAttrDropdownField': 'submitTimeAttr'
        },

        initialize: function () {

            // Setup subject handlers
            this.dataModelSubject = this.model.get('dataModelSubject');
            this.barModelSubjects = this.model.get('barModelSubjects');

            // TODO: Handlers for data changes




            // TODO: Add, remove, reset handlers
            // this.listenTo(this.model, 'change', this.updateChildren);
            // this.listenTo(this.model, 'change:all', this.setupMouseInteractions);

            this.dragBoxLastLeftX = Infinity;
            this.dragBoxLastRightX = -Infinity;

            // this.setupVerticalLine();
            this.renderInitializationMenu();
        },

        renderInitializationMenu: function () {
            this.userBarsView.$el.addClass('hidden');

            var fields = [];
            _.each(metadata, function (attributes, graphType) {
                _.each(attributes, function (attrDesc, attrName) {
                    if (attrDesc.type === 'date') {
                        fields.push({
                            graphType, attrName,
                            displayName: '' + graphType + ':' + attrName
                        });
                    }
                });
            });

            var params = {fields};
            var html = this.timeBarInitializationMenuTemplate(params);
            this.$timeExplorerMain.append(html);
        },

        submitTimeAttr: function (evt) {
            var target = $(evt.currentTarget);
            evt.preventDefault();

            var timeType = target.data('graph-type');
            var timeAttr = target.data('attr-name');

            console.log('submitting timeType, timeAttr: ', timeType, timeAttr);

            this.dataModelSubject.take(1).do((dataModel) => {
                var newModel = _.clone(dataModel);
                newModel.timeAttr = timeAttr;
                newModel.timeType = timeType;

                this.dataModelSubject.onNext(newModel);
                this.render();
                this.setupMouseInteractions();
                this.setupSliderInteractions();
                this.updateChildrenViewList();
            }).subscribe(_.identity, util.makeErrorHandler('updating time attr'));
            // this.model.get('explorer').modifyTimeDescription({
            //     timeType: timeType,
            //     timeAttr: timeAttr
            // });
        },

        render: function () {
            // TODO: New div and render correct eleements in right order
            this.$timeExplorerMain.empty();

            // console.log('RENDERING TOP LEVEL VIEW');
            this.$timeExplorerMain.append(this.mainBarView.el);
            this.$timeExplorerAxisContainer.append(this.bottomAxisView.el);

            // Make time slider visible
            this.$filterSlider.bootstrapSlider({tooltip: 'hide'});
            // $('#timeFilterSliderRow').css('visibility', 'visible');

            this.userBarsView.$el.removeClass('hidden');
        },

        setupMouseInteractions: function () {
            // TODO: Figure out how to make this not fire everytime changes occur,
            // but only when data is first added
            if (!this.enableMouseInteractions) {
                this.setupVerticalLine();
                this.setupZoomInteraction();
                this.enableMouseInteractions = true;
            }
        },

        setupSliderInteractions: function () {
            var offset = this.$timeExplorerVizContainer.offset().left

            // TODO: Instead of directly tying input -> side effect, go through model
            this.$filterSlider.on('slide', (evt) => {
                var [rawStart, rawStop] = evt.value;
                var start = rawStart / 1000; // scale to ratio
                var stop = rawStop / 1000; // scale to ratio

                var width = this.$timeExplorerVizContainer.width();

                var leftX = (width * start) + offset - 1;
                var rightX = (width * stop) + offset - 1;

                // Don't actually update model until the slider is released

                // Move the dragBox size
                this.$dragBox.css('left', leftX);
                this.$dragBox.css('width', rightX - leftX);

                // Show or hide dragbox based on values
                if (rawStart === 0 && rawStop === 1000) {
                    this.$dragBox.css('display', 'none');
                } else {
                    this.$dragBox.css('display', 'block');
                }

            });


            this.$filterSlider.on('slideStop', (evt) => {
                var [rawStart, rawStop] = evt.value;
                var sliderStart = rawStart / 1000; // scale to ratio
                var sliderStop = rawStop / 1000; // scale to ratio

                var shouldResetFilter = (rawStart === 0 && rawStop === 1000);

                this.dataModelSubject.take(1).do((model) => {
                    var newModel = _.clone(model);

                    if (shouldResetFilter) {
                        newModel.filterTimeBounds = {
                            start: null, stop: null
                        }
                    } else {
                        var localTimeBoundDiff = model.localTimeBounds.stop - model.localTimeBounds.start;
                        var filterStartOffset = sliderStart * localTimeBoundDiff;
                        var filterStopOffset = sliderStop * localTimeBoundDiff;
                        newModel.filterTimeBounds = {
                            start: model.localTimeBounds.start + filterStartOffset,
                            stop: model.localTimeBounds.start + filterStopOffset
                        };
                    }

                    this.dataModelSubject.onNext(newModel);
                }).subscribe(_.identity, util.makeErrorHandler('updating time filter'));

            });




        },

        setupZoomInteraction: function () {
            var that = this;
            var zoomBase = 1.03;

            this.$timeExplorerVizContainer.onAsObservable('mousewheel')
                // TODO Replace this with correct Rx5 handler.
                .inspectTime(SCROLL_SAMPLE_TIME)
                .do(function (wheelEvent) {
                    wheelEvent.preventDefault();
                })
                .do(function(wheelEvent) {

                    // DONT ZOOM IF DRAG BOX IS VISIBLE
                    // TODO: Enable zooming and rescale box
                    if (that.$dragBox.css('display') !== 'none') {
                        return;
                    }

                    var zoomFactor = (wheelEvent.deltaY < 0 ? zoomBase : 1.0 / zoomBase) || 1.0;

                    var xPos = wheelEvent.pageX;
                    var percentage = that.mainBarView.getPercentageForPosition(xPos);

                    var explorer = that.model.get('explorer');
                    explorer.zoomTimeRange(zoomFactor, percentage, that.$dragBox);

                }).subscribe(_.identity, util.makeErrorHandler('zoom handle on time explorer'));


        },

        handleMouseDown: function (evt) {
            // Return early if it's a UI element
            // TODO: Figure out how to represent this in terms of the selector
            var $target = $(evt.target);
            if ($target.hasClass('btn') || $target.hasClass('form-control') || $target.hasClass('slider-handle')) {
                return;
            }

            var that = this;
            var explorer = that.model.get('explorer');

            if (!this.enableMouseInteractions) {
                return;
            }

            // In the middle of prior click/double click. Don't start new one.
            if (that.handlingMouseDown) {
                return;
            }
            that.handlingMouseDown = true;


            if (INTERACTION_MODE === 'ZOOM') {
                var startX = evt.pageX;
                var leftX = evt.pageX;
                var rightX = evt.pageX;
                var mouseMoved = false;

                var positionChanges = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousemove')
                    .map(function (evt) {

                        mouseMoved = true;
                        var newX = evt.pageX;
                        var ends = [startX, newX];
                        leftX = _.min(ends);
                        rightX = _.max(ends);

                        that.$dragBox.css('left', leftX);
                        that.$dragBox.css('width', rightX - leftX);
                        that.$dragBox.css('display', 'block');

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

                Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mouseup')
                    .take(1)
                    .do(function () {
                        positionChanges.dispose();

                        var filterDownFunc = function () {
                            var leftBin = that.mainBarView.getBinForPosition(leftX);
                            var rightBin = that.mainBarView.getBinForPosition(rightX);

                            var mainBarData = that.model.get('all');
                            var cutoffs = mainBarData.cutoffs;

                            var leftCutoff = cutoffs[leftBin];
                            var rightCutoff = cutoffs[rightBin + 1];

                            var explorer = that.model.get('explorer');
                            explorer.modifyTimeDescription({
                                start: leftCutoff,
                                stop: rightCutoff
                            });

                            that.handlingMouseDown = false;
                        };

                        var zoomOutFunc = function () {
                            var explorer = that.model.get('explorer');
                            explorer.modifyTimeDescription({
                                start: explorer.originalStart,
                                stop: explorer.originalStop
                            });

                            Rx.Observable.timer(DOUBLE_CLICK_TIME)
                                .take(1)
                                .do(function () {
                                    that.handlingMouseDown = false;
                                }).subscribe(_.identity);
                        };

                        if (leftX === rightX) {
                            // Click
                            // Wait for new click to zoom out, else zoom in
                            // TODO: Figure out how to do this in terms of user accessibility settings
                            // that the user specified on how long to wait between double click.
                            var mousedownStream = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousedown');
                            var timer = Rx.Observable.timer(DOUBLE_CLICK_TIME);

                            timer.merge(mousedownStream)
                                .take(1)
                                .do(function (val) {
                                    if (val) {
                                        // Is mousedown event
                                        zoomOutFunc();
                                    } else {
                                        // Timed out, is click
                                        filterDownFunc();
                                    }
                                }).subscribe(_.identity, util.makeErrorHandler('time explorer double click'));

                        } else {
                            // Drag
                            filterDownFunc();
                        }

                        that.$dragBox.css('display', 'none');

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag mouseup'));

            } else if (INTERACTION_MODE === 'FILTER') {

                var startX = evt.pageX;
                var startLeftX = that.dragBoxLastLeftX;
                var startRightX = that.dragBoxLastRightX;
                var leftX = evt.pageX;
                var rightX = evt.pageX;
                var mouseMoved = false;

                var clickedOnOldWindow = (startX >= that.dragBoxLastLeftX && startX <= that.dragBoxLastRightX);

                var positionChanges = Rx.Observable.fromEvent(that.$timeExplorerVizContainer, 'mousemove')
                    .map(function (evt) {

                        mouseMoved = true;
                        var newX = evt.pageX;

                        if (clickedOnOldWindow) {

                            var leftBound = that.$timeExplorerMain.offset().left + timeBar.margin.left;
                            var rightBound = that.$timeExplorerMain.offset().left + that.$timeExplorerMain.width() - timeBar.margin.right;
                            // Slight extra padding
                            leftBound += 2;
                            rightBound -= 5;

                            // Prevent delta from going off the border
                            var delta = newX - startX;
                            // check left
                            if (startLeftX + delta <= leftBound) {
                                delta = leftBound - startLeftX;
                            }
                            // check right
                            if (startRightX + delta >= rightBound) {
                                delta = rightBound - startRightX;
                            }

                            that.dragBoxLastLeftX = startLeftX + delta;
                            that.dragBoxLastRightX = startRightX + delta;

                            leftX = that.dragBoxLastLeftX;
                            rightX = that.dragBoxLastRightX;

                            that.$dragBox.css('left', leftX);
                            that.$dragBox.css('width', rightX - leftX);
                            that.$dragBox.css('display', 'block');

                        } else {
                            // Create new window
                            var ends = [startX, newX];
                            leftX = _.min(ends);
                            rightX = _.max(ends);

                            that.dragBoxLastRightX = rightX;
                            that.dragBoxLastLeftX = leftX;

                            that.$dragBox.css('left', leftX);
                            that.$dragBox.css('width', rightX - leftX);
                            that.$dragBox.css('display', 'block');

                        }
                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

                Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mouseup')
                    .take(1)
                    .do(function () {
                        positionChanges.dispose();

                        var removeFilterFunc = function () {

                            that.dragBoxLastLeftX = Infinity;
                            that.dragBoxLastRightX = -Infinity;

                            explorer.updateGraphTimeFilter(null);
                            that.handlingMouseDown = false;
                            that.$dragBox.css('display', 'none');

                            // Update model to show no time filter
                            that.dataModelSubject.take(1).do((model) => {
                                var newModel = _.clone(model);
                                newModel.filterTimeBounds = null;
                                that.dataModelSubject.onNext(newModel);
                            });

                        };

                        var applyFilterFunc = function () {
                            var mainBarData = that.mainBarView.lastBarModel.serverData;
                            var cutoffs = mainBarData.cutoffs;

                            var leftBin = that.mainBarView.getBinForPosition(leftX);
                            var rightBin = that.mainBarView.getBinForPosition(rightX);

                            // Guard edges
                            leftBin = Math.max(leftBin, 0);
                            rightBin = Math.min(rightBin, cutoffs.length - 2);

                            var leftCutoff = cutoffs[leftBin];
                            var rightCutoff = cutoffs[rightBin + 1];

                            // Update model to show new time filter
                            that.dataModelSubject.take(1).do((model) => {
                                var newModel = _.clone(model);
                                newModel.filterTimeBounds = {
                                    start: leftCutoff,
                                    stop: rightCutoff
                                };
                                that.dataModelSubject.onNext(newModel);
                            });

                            that.handlingMouseDown = false;
                        };

                        if (leftX === rightX) {
                            // Click
                            if (clickedOnOldWindow) {
                                removeFilterFunc();
                            } else {
                                that.handlingMouseDown = false;
                            }

                        } else {
                            // Drag
                            applyFilterFunc();
                        }

                    }).subscribe(_.identity, util.makeErrorHandler('time explorer drag mouseup'));

            }


        },

        setupVerticalLine: function () {
            var that = this;
            this.$timeExplorerVizContainer.on('mouseover', function (evt) {
                that.$verticalLine.css('display', 'block');
            });
            this.$timeExplorerVizContainer.on('mouseout', function (evt) {
                that.$verticalLine.css('display', 'none');
            });
            this.$timeExplorerVizContainer.on('mousemove', function (evt) {
                var x = evt.pageX - 1;
                that.$verticalLine.css('left', '' + x + 'px');
            });
        },

        mousemove: function (evt) {
            if (!this.enableMouseInteractions) {
                return;
            }

            this.dataModelSubject.take(1).do((model) => {
                var newModel = _.clone(model);
                newModel.mouseX = evt.pageX;
                this.dataModelSubject.onNext(newModel);
            }).subscribe(_.identity, util.makeErrorHandler('mousemove timebar'));

            // this.mainBarView.mousemoveParent(evt);
            // this.userBarsView.mousemoveParent(evt);
        },

        mouseout: function (evt) {
            if (!this.enableMouseInteractions) {
                return;
            }

            this.dataModelSubject.take(1).do((model) => {
                var newModel = _.clone(model);
                newModel.mouseX = null;
                this.dataModelSubject.onNext(newModel);
            }).subscribe(_.identity, util.makeErrorHandler('mouseout timebar'));

        },

        updateChildrenViewList: function () {

            var childrenSubjects = this.barModelSubjects;
            var allSubjects = childrenSubjects.slice();

            var collection = this.userBarsView.collection;

            var idZipFunc = function () {
                var retArr = [];
                for (var i = 0; i < arguments.length; i++) {
                    retArr.push(arguments[i].id);
                }
                return retArr;
            }

            allSubjects.push(idZipFunc);
            Rx.Observable.zip.apply(Rx.Observable, allSubjects).take(1).do((ids) => {

                // TODO: Make it so this doesn't eagerly run

                var idToSubjectMap = {};
                for (var i = 0; i < ids.length; i++) {
                    var id = ids[i];
                    idToSubjectMap[id] = allSubjects[i];
                }

                // Deal with first (all Bar)
                // TODO FIXME: Stop treating this one specially
                this.mainBarView.model.set('barModelSubject', idToSubjectMap[ids[0]]);
                this.mainBarView.model.set('dataModelSubject', this.dataModelSubject);
                this.mainBarView.model.set('explorer', this.model.get('explorer'));
                this.mainBarView.model.set('barType', 'main');
                this.mainBarView.model.set('lineUnchanged', 'false');
                this.mainBarView.model.id = ids[0];

                // Remove first element for all bar
                ids.shift();

                var existingKeys = _.pluck(collection.models, 'id');
                var updatedKeys = _.intersection(ids, existingKeys);
                var newKeys = _.difference(ids, existingKeys);


                // Unless subjects can change (Not supported today),
                // don't have to deal with updated.

                // TODO: Support deleting elements

                // add new bars
                var barModels = [];

                _.each(updatedKeys, (key) => {
                    // console.log('Updating data for: ', key);

                    var params = {
                        barModelSubject: idToSubjectMap[key],
                        dataModelSubject: this.dataModelSubject,
                        lineUnchanged: false,
                        barType: 'user'
                    };

                    var model = collection.get(key);
                    model.set(params);
                    barModels.push(model);
                });

                //Add new data elements
                _.each(newKeys, (key) => {
                    var barModel = new timeBar.model({explorer: explorer});
                    var params = {
                        barModelSubject: idToSubjectMap[key],
                        dataModelSubject: this.dataModelSubject,
                        lineUnchanged: false,
                        barType: 'user'
                    };

                    barModel.set(params);
                    barModel.set('explorer', this.model.get('explorer'));
                    barModel.id = key;
                    barModels.push(barModel);
                });

                collection.set(barModels);

            }).subscribe(_.identity, util.makeErrorHandler('Failed zip of time panel subjects'));

        },

        // updateChildren: function () {
        //     var data = this.model.attributes;
        //     var explorer = this.model.get('explorer');
        //     var params;

        //     // TODO: Make this a cleaner system
        //     var axisKey = '' + data.all.start + data.all.stop + data.all.timeAggregation;

        //     // Handle axis
        //     params = {
        //         data: data.all,
        //         timeStamp: Date.now(),
        //         key: axisKey
        //     };
        //     this.bottomAxisView.model.set(params);

        //     // Handle main bar, '_all'
        //     params = {
        //         data: data.all,
        //         maxBinValue: data.maxBinValue,
        //         timeStamp: Date.now(),
        //         showTimeAggregationButtons: true,
        //         lineUnchanged: false
        //     };
        //     this.mainBarView.model.id = params.data.name;
        //     this.mainBarView.model.set('barType', 'main');
        //     this.mainBarView.model.set(params);

        //     var barModels = [];
        //     var collection = this.userBarsView.collection;

        //     // console.log('DATA: User: ', data.user);
        //     // console.log('Collection: ', collection);


        //     var dataKeys = _.keys(data.user);
        //     var existingKeys = _.pluck(collection.models, 'id');

        //     var updatedKeys = _.intersection(dataKeys, existingKeys);
        //     var newKeys = _.difference(dataKeys, existingKeys);
        //     // var deletedKeys = _.difference(existingKeys, dataKeys);

        //     var barModels = [];

        //     // Handle updated keys
        //     _.each(updatedKeys, function (key) {
        //         var val = data.user[key];
        //         // console.log('Updating data for: ', key);

        //         var params = {
        //             data: val,
        //             maxBinValue: data.maxBinValue,
        //             timeStamp: Date.now(),
        //             lineUnchanged: false
        //         };

        //         var model = collection.get(key);
        //         model.set(params);
        //         model.set('barType', 'user');
        //         barModels.push(model);
        //     });

        //     //Add new data elements
        //     _.each(newKeys, function (key) {
        //         var val = data.user[key];
        //         var barModel = new timeBar.model({explorer: explorer});
        //         var params = {
        //             data: val,
        //             maxBinValue: data.maxBinValue,
        //             timeStamp: Date.now(),
        //             lineUnchanged: false
        //         };

        //         barModel.set(params);
        //         barModel.set('barType', 'user');
        //         barModel.id = key;
        //         barModels.push(barModel);
        //     });

        //     collection.set(barModels);
        // }

    });

    this.model = new TimeExplorerModel({explorer: explorer, dataModelSubject: explorer.dataModelSubject, barModelSubjects: explorer.barModelSubjects});
    this.view = new TimeExplorerView({model: this.model});
    this.collection = this.userBars;

}

module.exports = TimeExplorerPanel;


