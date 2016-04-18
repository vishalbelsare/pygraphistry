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
var INTERACTION_MODE = 'PANZOOM';

//////////////////////////////////////////////////////////////////////////////
// Explorer Panel
//////////////////////////////////////////////////////////////////////////////

function TimeExplorerPanel (socket, $parent, metadata, explorer) {
    var that = this;

    this.userBars = new userTimeBars.collection({explorer: explorer});

    var userBarsModel = new userTimeBars.model({explorer: explorer, metadata});
    this.userBarsView = new userTimeBars.view({explorer: explorer, collection: this.userBars, model: userBarsModel});

    var mainBarModel = new timeBar.model({explorer: explorer, timeStamp: Date.now()});
    mainBarModel.set('barModelSubject', explorer.barModelSubjects[0]);
    mainBarModel.set('dataModelSubject', explorer.dataModelSubject);
    mainBarModel.set('metadata', metadata);
    mainBarModel.set('barType', 'main');
    mainBarModel.set('lineUnchanged', 'false');

    this.mainBarView = new timeBar.view({model: mainBarModel});
    this.bottomAxisView = new timeExplorerBottomAxis.view({model: new timeExplorerBottomAxis.model({explorer: explorer}) });

    this.metadata = metadata;

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
        $encodingBoxA: $('#timeExplorerEncodingA'),
        $encodingBoxB: $('#timeExplorerEncodingB'),
        $encodingBoxC: $('#timeExplorerEncodingC'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        $filterSlider: $('#time-panel-filter-slider'),
        $encodingSliderA: $('#time-panel-encoding-slider-a'),
        $encodingSliderB: $('#time-panel-encoding-slider-b'),
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
            this.$filterSlider.toggleClass('hidden', false);
            this.$encodingSliderA.bootstrapSlider({tooltip: 'hide'});
            this.$encodingSliderA.toggleClass('hidden', false);
            this.$encodingSliderB.bootstrapSlider({tooltip: 'hide'});
            this.$encodingSliderB.toggleClass('hidden', false);
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
            var offset = this.$timeExplorerVizContainer.offset().left - 1;

            // TODO: Instead of directly tying input -> side effect, go through model
            this.$filterSlider.on('slide', (evt) => {
                var [rawStart, rawStop] = evt.value;
                var start = rawStart / 1000; // scale to ratio
                var stop = rawStop / 1000; // scale to ratio

                var width = this.$timeExplorerVizContainer.width();

                var leftX = (width * start) + offset;
                var rightX = (width * stop) + offset;

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

            var defaultFakeEvent = {value: [0, 1000]};
            var aSliderObservable = this.$encodingSliderA.onAsObservable('slide').merge(Rx.Observable.from([defaultFakeEvent]));
            var bSliderObservable = this.$encodingSliderB.onAsObservable('slide').merge(Rx.Observable.from([defaultFakeEvent]));
            var aSlideStopObservable = this.$encodingSliderA.onAsObservable('slideStop').merge(Rx.Observable.from([defaultFakeEvent]));
            var bSlideStopObservable = this.$encodingSliderB.onAsObservable('slideStop').merge(Rx.Observable.from([defaultFakeEvent]));

            var wrappedToRatioInfo = function (wrapped) {
                var {aEvt, bEvt} = wrapped;
                var [aRawStart, aRawStop] = aEvt.value;
                var [bRawStart, bRawStop] = bEvt.value;

                // Convert to ratios
                var aStart = aRawStart/1000;
                var aStop = aRawStop/1000;
                var bStart = bRawStart/1000;
                var bStop = bRawStop/1000;

                // Convert to A B C, where C is overlap of B and C

                var cStart = Math.max(aStart, bStart);
                var cStop = Math.min(aStop, bStop);
                var cExists = (cStart < cStop);

                var cContained = false;
                var shouldShowA = undefined;
                var shouldShowB = undefined;
                var shouldShowC = undefined;

                // Adjust a and b so that they don't overlap with C;
                if (cExists) {
                    // A is within B
                    if (aStart >= bStart && aStop <= bStop) {
                        cContained = true;
                        shouldShowA = false;
                    // B is within A
                    } else if (bStart >= aStart && bStop <= aStop) {
                        cContained = true;
                        shouldShowB = false;
                    // A on left
                    } else if (aStart < cStart) {
                        aStop = cStart;
                        bStart = cStop;
                    // B on left
                    } else {
                        bStop = cStart;
                        aStart = cStop;
                    }
                }

                // Render boxes
                var shouldShowA = shouldShowA === undefined ? ((aStart !== aStop)) : shouldShowA;
                var shouldShowB = shouldShowB === undefined ? ((bStart !== bStop)) : shouldShowB;
                if (aStart === 0 && aStop === 1 && bStart === 0 && bStop === 1) {
                    shouldShowA = false;
                    shouldShowB = false;
                }
                var shouldShowC = (cContained && (shouldShowA || shouldShowB))|| (shouldShowA && shouldShowB && cExists);

                return {
                    shouldShowA, aStart, aStop,
                    shouldShowB, bStart, bStop,
                    shouldShowC, cStart, cStop
                };
            };

            Rx.Observable.combineLatest(aSliderObservable, bSliderObservable,
                (aEvt, bEvt) => {
                    return {aEvt, bEvt};
                }
            ).do((wrapped) => {
                var {
                    shouldShowA, aStart, aStop,
                    shouldShowB, bStart, bStop,
                    shouldShowC, cStart, cStop
                } = wrappedToRatioInfo(wrapped);

                var width = this.$timeExplorerVizContainer.width();

                var leftX, rightX;
                if (shouldShowA) {
                    leftX = (width * aStart) + offset;
                    rightX = (width * aStop) + offset;

                    this.$encodingBoxA.css('left', leftX);
                    this.$encodingBoxA.css('width', rightX - leftX);

                    this.$encodingBoxA.css('display', 'block');
                } else {
                    this.$encodingBoxA.css('display', 'none');
                }

                if (shouldShowB) {
                    leftX = (width * bStart) + offset;
                    rightX = (width * bStop) + offset;

                    this.$encodingBoxB.css('left', leftX);
                    this.$encodingBoxB.css('width', rightX - leftX);

                    this.$encodingBoxB.css('display', 'block');
                } else {
                    this.$encodingBoxB.css('display', 'none');
                }

                if (shouldShowC) {
                    leftX = (width * cStart) + offset;
                    rightX = (width * cStop) + offset;

                    this.$encodingBoxC.css('left', leftX);
                    this.$encodingBoxC.css('width', rightX - leftX);

                    this.$encodingBoxC.css('display', 'block');
                } else {
                    this.$encodingBoxC.css('display', 'none');
                }

            }).subscribe(_.identity, util.makeErrorHandler('handling time encoding slider'));

            Rx.Observable.combineLatest(aSlideStopObservable, bSlideStopObservable,
                (aEvt, bEvt) => {
                    return {aEvt, bEvt};
                }
            ).do((wrapped) => {
                var {
                    shouldShowA, aStart, aStop,
                    shouldShowB, bStart, bStop,
                    shouldShowC, cStart, cStop
                } = wrappedToRatioInfo(wrapped);

                 // Propagate it to data model:
                this.dataModelSubject.take(1).do((model) => {
                    var newModel = _.clone(model);

                    var convertRatioToTime = function (ratio) {
                        var localTimeBoundDiff = model.localTimeBounds.stop - model.localTimeBounds.start;
                        var offset = ratio * localTimeBoundDiff;
                        var concreteTime = model.localTimeBounds.start + offset;
                        return concreteTime;
                    };

                    if (shouldShowA) {
                        newModel.encodingBoundsA = {start: convertRatioToTime(aStart), stop: convertRatioToTime(aStop)};
                    } else {
                        newModel.encodingBoundsA = {start: null, stop: null};
                    }

                    if (shouldShowB) {
                        newModel.encodingBoundsB = {start: convertRatioToTime(bStart), stop: convertRatioToTime(bStop)};
                    } else {
                        newModel.encodingBoundsB = {start: null, stop: null};
                    }

                    if (shouldShowC) {
                        newModel.encodingBoundsC = {start: convertRatioToTime(cStart), stop: convertRatioToTime(cStop)};
                    } else {
                        newModel.encodingBoundsC = {start: null, stop: null};
                    }

                    this.dataModelSubject.onNext(newModel);
                }).subscribe(_.identity, util.makeErrorHandler('updating time filter'));

            }).subscribe(_.identity, util.makeErrorHandler('handling time encoding slider up'));

        },

        setupZoomInteraction: function () {
            var that = this;
            var zoomBase = 1.03;

            this.$timeExplorerVizContainer.onAsObservable('mousewheel')
                // TODO Replace this with correct Rx5 handler.
                .inspectTime(SCROLL_SAMPLE_TIME)
                .do(function (wheelEvent) {
                    wheelEvent.preventDefault();
                    wheelEvent.stopPropagation();
                })
                .do(function(wheelEvent) {

                    // HACK FIXME: DONT ZOOM IF DRAG BOX IS VISIBLE
                    // TODO: Enable zooming and rescale box
                    if (that.$dragBox.css('display') !== 'none' ||
                        that.$encodingBoxA.css('display') !== 'none' ||
                        that.$encodingBoxB.css('display') !== 'none' ||
                        that.$encodingBoxB.css('display') !== 'none'
                    ) {
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
            console.log('Handling mouse down');
            // Return early if it's a UI element
            // TODO: Figure out how to represent this in terms of the selector
            var $target = $(evt.target);
            if ($target.hasClass('btn') || $target.hasClass('form-control') || $target.hasClass('slider-handle')) {
                return;
            }

            // HACK FIXME: DONT ALLOW PANS IF DRAG BOX IS VISIBLE
            // TODO: Enable zooming and rescale box
            if (this.$dragBox.css('display') !== 'none' ||
                this.$encodingBoxA.css('display') !== 'none' ||
                this.$encodingBoxB.css('display') !== 'none' ||
                this.$encodingBoxB.css('display') !== 'none'
            ) {
                return;
            }

            if (!this.enableMouseInteractions) {
                return;
            }

            console.log('Passed checks')

            var lastX = evt.pageX;
            var width = this.$timeExplorerVizContainer.width();

            var positionChanges = Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mousemove')
                .flatMap((evt) => {
                    return this.dataModelSubject.take(1).map((dataModel) => {
                        return {dataModel, evt};
                    });
                })
                .do((wrapped) => {
                    var {dataModel, evt} = wrapped;
                    var newX = evt.pageX;

                    var newModel = _.clone(dataModel);
                    var percentageDiff = (lastX - newX) / width;
                    var timeDiff = Math.round(percentageDiff * (dataModel.localTimeBounds.stop - dataModel.localTimeBounds.start));

                    newModel.localTimeBounds = {
                        start: dataModel.localTimeBounds.start + timeDiff,
                        stop: dataModel.localTimeBounds.stop + timeDiff
                    }

                    lastX = newX;

                    console.log('Pos change');
                    this.dataModelSubject.onNext(newModel);

                }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

            Rx.Observable.fromEvent(this.$timeExplorerVizContainer, 'mouseup')
                .take(1)
                .do(function () {
                    // Dispose of mousedown handler stream
                    positionChanges.dispose();
                }).subscribe(_.identity, util.makeErrorHandler('time explorer drag mouseup'));

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
                        metadata: metadata,
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
                        metadata: metadata,
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


