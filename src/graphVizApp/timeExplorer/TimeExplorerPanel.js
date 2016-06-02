'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rxjs/Rx');
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
        $dragBoxLeft: $('#timeExplorerDragBoxLeft'),
        $dragBoxRight: $('#timeExplorerDragBoxRight'),
        $encodingBoxA: $('#timeExplorerEncodingA'),
        $encodingBoxB: $('#timeExplorerEncodingB'),
        $encodingBoxC: $('#timeExplorerEncodingC'),
        $verticalLine: $('#timeExplorerVerticalLine'),
        $filterSlider: $('#time-panel-filter-slider'),
        $encodingSliderA: $('#time-panel-encoding-slider-a'),
        $encodingSliderB: $('#time-panel-encoding-slider-b'),
        $timeExplorerContents: $('#timeExplorerContents'),
        $timeExplorerInitDiv: $('#timeExplorerInitDiv'),
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
            this.$timeExplorerInitDiv.append(html);
        },

        submitTimeAttr: function (evt) {
            var target = $(evt.currentTarget);
            evt.preventDefault();

            var timeType = target.data('graph-type');
            var timeAttr = target.data('attr-name');

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

            this.$timeExplorerInitDiv.empty();
            this.$timeExplorerInitDiv.addClass('hidden');
            this.$timeExplorerContents.removeClass('hidden');

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
            $('[data-toggle="tooltip"]', this.$el).tooltip();

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

                // These x coordinates are not adjusted for offset
                var leftX = (width * start);
                var rightX = (width * stop);

                // Don't actually update model until the slider is released

                // Move and resize the dragBoxes
                this.$dragBoxLeft.css('left', offset);
                this.$dragBoxLeft.css('width', leftX)

                this.$dragBoxRight.css('left', rightX + offset);
                this.$dragBoxRight.css('width', width - rightX);

                // Show or hide dragbox based on values
                if (rawStart === 0 && rawStop === 1000) {
                    this.$dragBoxLeft.css('display', 'none');
                    this.$dragBoxRight.css('display', 'none');
                    this.$el.find('#timeEncodingSliderRow').removeClass('disabled');
                } else {
                    this.$dragBoxLeft.css('display', 'block');
                    this.$dragBoxRight.css('display', 'block');
                    this.$el.find('#timeEncodingSliderRow').addClass('disabled');
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

                var regionsToDraw = [];
                if (shouldShowC) {
                    regionsToDraw.push({
                        left: cStart,
                        right: cStop,
                        color: 'purple'
                    });
                }

                if (shouldShowC && cContained) {
                    if (shouldShowA) {
                        regionsToDraw.push({
                            left: aStart,
                            right: cStart,
                            color: 'red'
                        });
                        regionsToDraw.push({
                            left: cStop,
                            right: aStop,
                            color: 'red'
                        });
                    } else if (shouldShowB) {
                        regionsToDraw.push({
                            left: bStart,
                            right: cStart,
                            color: 'blue'
                        });
                        regionsToDraw.push({
                            left: cStop,
                            right: bStop,
                            color: 'blue'
                        });
                    }
                } else {
                    if (shouldShowA) {
                        regionsToDraw.push({
                            left: aStart,
                            right: aStop,
                            color: 'red'
                        });
                    }
                    if (shouldShowB) {
                        regionsToDraw.push({
                            left: bStart,
                            right: bStop,
                            color: 'blue'
                        });
                    }
                }


                return {
                    shouldShowA, aStart, aStop,
                    shouldShowB, bStart, bStop,
                    shouldShowC, cStart, cStop,
                    regionsToDraw
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
                    shouldShowC, cStart, cStop, regionsToDraw
                } = wrappedToRatioInfo(wrapped);

                var width = this.$timeExplorerVizContainer.width();

                var boxElements = [this.$encodingBoxA, this.$encodingBoxB, this.$encodingBoxC];

                if (shouldShowA || shouldShowB || shouldShowC) {
                    this.$el.find('#timeFilterSliderRow').addClass('disabled');
                } else {
                    this.$el.find('#timeFilterSliderRow').removeClass('disabled');
                }

                _.each(boxElements, (element, i) => {
                    var drawingInfo = regionsToDraw[i];

                    element.removeClass('red').removeClass('blue').removeClass('purple');

                    if (drawingInfo) {
                        const leftX = (width * drawingInfo.left) + offset;
                        const rightX = (width * drawingInfo.right) + offset;

                        element.css('left', leftX).css('width', rightX - leftX);
                        element.addClass(drawingInfo.color);
                        element.css('display', 'block');
                    } else {
                        element.css('display', 'none');
                    }
                });

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
                .auditTime(SCROLL_SAMPLE_TIME)
                .do(function (wheelEvent) {
                    wheelEvent.preventDefault();
                    wheelEvent.stopPropagation();
                })
                .do(function(wheelEvent) {

                    // HACK FIXME: DONT ZOOM IF DRAG BOX IS VISIBLE
                    // TODO: Enable zooming and rescale box
                    if (that.$dragBoxLeft.css('display') !== 'none' ||
                        that.$dragBoxRight.css('display') !== 'none' ||
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
                    explorer.zoomTimeRange(zoomFactor, percentage);

                }).subscribe(_.identity, util.makeErrorHandler('zoom handle on time explorer'));


        },

        handleMouseDown: function (evt) {
            // Return early if it's a UI element
            // TODO: Figure out how to represent this in terms of the selector
            var $target = $(evt.target);
            if ($target.hasClass('btn') || $target.hasClass('form-control') || $target.hasClass('slider-handle')) {
                return;
            }

            // HACK FIXME: DONT ALLOW PANS IF DRAG BOX IS VISIBLE
            // TODO: Enable zooming and rescale box
            if (this.$dragBoxLeft.css('display') !== 'none' ||
                this.$dragBoxRight.css('display') !== 'none' ||
                this.$encodingBoxA.css('display') !== 'none' ||
                this.$encodingBoxB.css('display') !== 'none' ||
                this.$encodingBoxB.css('display') !== 'none'
            ) {
                return;
            }

            if (!this.enableMouseInteractions) {
                return;
            }

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

                    this.dataModelSubject.onNext(newModel);

                }).subscribe(_.identity, util.makeErrorHandler('time explorer drag move'));

            // We make a handler here for mouseouts of JUST the document.
            // That is, a mouseout event from a child of the document won't trigger this,
            // only someone mouseing out of the window
            // Technique taken from http://stackoverflow.com/questions/923299/how-can-i-detect-when-the-mouse-leaves-the-window
            const mouseOutOfWindowStream = Rx.Observable.fromEvent(document, 'mouseout')
                .filter((e=window.event) => {
                    const from = e.relatedTarget || e.toElement;
                    return (!from || from.nodeName === 'HTML');
                });

            Rx.Observable.fromEvent(document, 'mouseup')
                .merge(mouseOutOfWindowStream)
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

        },

        mouseout: function (evt) {
            if (!this.enableMouseInteractions) {
                return;
            }

            // Hide all tooltips when moused out, especially if any get stuck
            // TODO FIXME: Figure out a better way to deal with this and
            // prevent it from being necesary.
            this.$el.children('.tooltip').remove();

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
                //
                // Deleting is handled by simply not adding to the new barModels

                // add new bars
                var barModels = [];

                _.each(updatedKeys, (key) => {

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

        }

    });

    this.model = new TimeExplorerModel({explorer: explorer, dataModelSubject: explorer.dataModelSubject, barModelSubjects: explorer.barModelSubjects});
    this.view = new TimeExplorerView({model: this.model});
    this.collection = this.userBars;

}

module.exports = TimeExplorerPanel;


