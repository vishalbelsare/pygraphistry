'use strict';

var $       = window.$;
//var _       = require('underscore');
var Rx      = require('rx');
require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone   = require('backbone');
    Backbone.$ = $;
var _          = require('underscore');
var util       = require('./util.js');
var Command    = require('./command.js');

/**
 * @typedef {Object} SelectionElement
 * @property {Number} dim - Enum: 1 for point, 2 for edge.
 * @property {Number} idx - Index into the filtered dataframe.
 * @property {String} source - whether from canvas click, etc.
 */


function unionOfTwoMasks (x, y) {
    // TODO: this is a copy of DataframeMask.unionOfTwoMasks. de-duplicate through common code-share.
    var xLength = x.length, yLength = y.length;
    // Smallest result: one is a subset of the other.
    var result = new Array(Math.max(xLength, yLength));
    var xIndex = 0, yIndex = 0, resultIndex = 0;
    while (xIndex < xLength && yIndex < yLength) {
        if (x[xIndex] < y[yIndex]) {
            result[resultIndex++] = x[xIndex++];
        } else if (y[yIndex] < x[xIndex]) {
            result[resultIndex++] = y[yIndex++];
        } else /* x[xIndex] === y[yIndex] */ {
            result[resultIndex++] = y[yIndex++];
            xIndex++;
        }
    }
    while (xIndex < xLength) {
        result[resultIndex++] = x[xIndex++];
    }
    while (yIndex < yLength) {
        result[resultIndex++] = y[yIndex++];
    }
    return result;
}


var VizSetModel = Backbone.Model.extend({
    default: {
        title: undefined,
        description: undefined
    },
    /**
     * @returns {SelectionElement[]}
     */
    asVizSelection: function () {
        var mask = this.get('mask');
        if (mask === undefined) { return undefined; }
        var result = []; // new Array(mask.point.length + mask.edge.length);
        if (mask.point) {
            _.each(mask.point, function (pointIndex) {
                result.push({dim: 1, idx: pointIndex});
            });
        }
        if (mask.edge) {
            _.each(mask.edge, function (edgeIndex) {
                result.push({dim: 2, idx: edgeIndex});
            });
        }
        return result;
    },
    /**
     * @param {SelectionElement[]} selections
     */
    fromVizSelection: function (selections) {
        var mask = this.get('mask');
        if (this.get('setSource') === undefined) {
            this.set('setSource', 'selection');
        }
        if (mask === undefined) {
            mask = {point: [], edge: []};
            this.set('mask', mask);
        }
        _.each(selections, function (selection) {
            switch (selection.dim) {
                case 1:
                    mask.point.push(selection.idx);
                    break;
                case 2:
                    mask.edge.push(selection.idx);
                    break;
                default:
                    throw Error('Unrecognized dimension in selection: ' + selection.dim);
            }
        });
        mask.point = _.uniq(mask.point.sort(), true);
        mask.edge = _.uniq(mask.edge.sort(), true);
    },
    /**
     * @param {VizSetModel} otherSet
     * @returns {VizSetModel}
     */
    union: function (otherSet) {
        var result = new VizSetModel();
        if (!this.isConcrete() || !otherSet.isConcrete()) {
            throw Error('Cannot perform union on abstract set');
        }
        var resultMask = {}, thisMask = this.get('mask'), otherMask = otherSet.get('mask');
        resultMask.point = unionOfTwoMasks(thisMask.point, otherMask.point);
        resultMask.edge = unionOfTwoMasks(thisMask.edge, otherMask.edge);
        result.set('mask', resultMask);
        return result;
    },
    isSystem: function () {
        return this.get('level') === 'system';
    },
    isSelected: function (newValue) {
        if (newValue !== undefined) {
            this.set('selected', newValue);
        }
        return this.get('selected');
    },
    isConcrete: function () {
        return this.get('mask') !== undefined;
    },
    getGeneratedDescription: function () {
        var setSource = this.get('setSource');
        var result;
        switch (setSource) {
            case 'selection':
                var mask = this.get('mask');
                if (mask === undefined) {
                    result = 'A selection';
                } else {
                    result = 'Selected ';
                    var numPoints = mask.point.length;
                    var hasPoints = numPoints > 0;
                    if (hasPoints) {
                        result += numPoints.toString(10) + ' point';
                        if (numPoints > 1) { result += 's'; }
                    }
                    var numEdges = mask.edge.length;
                    var hasEdges = numEdges > 0;
                    if (hasPoints && hasEdges) {
                        result += ' and ';
                    }
                    if (hasEdges) {
                        result += numEdges.toString(10) + ' edge';
                        if (numEdges > 1) { result += 's'; }
                    }
                }
                break;
        }
        return result;
    },
    sync: function (method, model, options) {
        if (options === undefined) { options = {}; }
        var success = options.success;
        switch (method) {
            case "read":
                break;
            case "delete":
                if (model.id === undefined) {
                    break;
                }
                this.panel.deleteSet(model.toJSON()).do(function (response) {
                    if (typeof success === 'function') {
                        success.call(options.context, model, response, options);
                    }
                }).subscribe(_.identity, util.makeErrorHandler('Deleting a Set'));
                break;
            case "update":
                // TODO handle options.patch
                this.panel.updateSet(model.toJSON()).do(function (response) {
                    if (response.success === true && response.set !== undefined) {
                        model.set(response.set);
                    }
                    if (typeof success === 'function') {
                        success.call(model, response, options);
                    }
                }).subscribe(_.identity, util.makeErrorHandler('Updating a Set'));
                break;
        }
    }
});

var VizSetCollection = Backbone.Collection.extend({
    model: VizSetModel
});

var VizSetView = Backbone.View.extend({
    tagName: 'div',
    className: 'setEntry',
    events: {
        'mouseover': 'highlight',
        'mouseout': 'unhighlight',
        'click': 'toggleSelected',
        'click .deleteButton': 'delete',
        'click .tagButton': 'rename'
    },
    initialize: function (options) {
        this.listenTo(this.model, 'destroy', this.remove);
        this.listenTo(this.model, 'change', this.save);
        this.template = Handlebars.compile($('#setTemplate').html());
        this.panel = options.panel;
    },
    bindingsFor: function (vizSet) {
        var bindings = vizSet.toJSON();
        bindings.isSystem = vizSet.isSystem();
        if (!bindings.description) {
            bindings.description = vizSet.getGeneratedDescription();
        }
        bindings.selectionClass = bindings.selected ? 'bg-info' : '';
        return bindings;
    },
    render: function () {
        var bindings = this.bindingsFor(this.model);
        var html = this.template(bindings);
        this.$el.html(html);
        return this;
    },
    save: function () {
        this.panel.updateSet(this.model.toJSON()).subscribe(function (response) {
            if (response.success === true && response.set !== undefined) {
                this.model.set(response.set);
            }
        }.bind(this),
        util.makeErrorHandler('Updating a Set'));
    },
    delete: function (/*event*/) {
        this.$el.remove();
        this.collection.remove(this.model);
    },
    rename: function (/*event*/) {
        var $modal = $(Handlebars.compile($('#setTagTemplate').html()));
        $('body').append($modal);
        $('.status', $modal).css('display', 'none');
        $modal.modal('show');
        Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
            .map(_.constant($modal)).do(function ($modal) {
                var setTag = $('.modal-body input', $modal).val();
                this.model.set('title', setTag);
            }).subscribe(
            function () {
                $modal.remove();
            }, util.makeErrorHandler('Exception while setting set tag'));
    },
    toggleSelected: function () {
        this.model.isSelected(!this.model.isSelected());
    },
    highlight: function (/*event*/) {
        this.panel.updateVizSelectionFrom([this.model], 'highlight');
    },
    unhighlight: function (/*event*/) {
        this.panel.updateVizSelectionFrom([], 'highlight');
    }
});

var AllVizSetsView = Backbone.View.extend({
    events: {
        'click .addSetButton': 'addSetFromSelection'
    },
    initialize: function (options) {
        this.listenTo(this.collection, 'add', this.addSet);
        this.listenTo(this.collection, 'remove', this.removeSet);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);
        this.listenTo(this.collection, 'change', this.updateVizSelectionFromSelectedSets);

        this.el = options.el;
        this.panel = options.panel;
        this.setsContainer = $('#sets');
        this.emptyMessage = $('#setsEmptyMessage');

        // Show if we get no initial collection elements:
        this.updateEmptyMessage();
        this.collection.each(this.addSet, this);
        // Deep compare to determine whether to update the viz selection:
        this.lastSetSelection = [];
    },
    shouldShow: function (vizSet) {
        return !vizSet.isSystem();
    },
    visibleSets: function () {
        return this.collection.select(function (vizSet) {
            return this.shouldShow(vizSet);
        }.bind(this));
    },
    selectedSets: function () {
        return this.collection.select(function (vizSet) {
            return vizSet.isSelected();
        });
    },
    updateVizSelectionFromSelectedSets: function () {
        var currentlySelectedSets = this.selectedSets();
        if (!_.isEqual(currentlySelectedSets, this.lastSetSelection)) {
            this.panel.updateVizSelectionFrom(currentlySelectedSets);
            this.lastSetSelection = currentlySelectedSets;
        }
    },
    render: function () {
        var $setsControlButton = $('#setsPanelButton');
        var visibleModels = this.visibleSets();
        $('.badge', $setsControlButton).text(visibleModels.length > 0 ? visibleModels.length : '');
        return this;
    },
    addSet: function (set) {
        if (!this.shouldShow(set)) {
            return;
        }
        var view = new VizSetView({
            model: set,
            collection: this.collection,
            panel: this.panel
        });
        var childElement = view.render().el;
        this.setsContainer.append(childElement);
        set.set('$el', $(childElement));
        this.updateEmptyMessage();
    },
    updateEmptyMessage: function () {
        this.emptyMessage.toggleClass('hidden', this.visibleSets().length > 0);
    },
    removeSet: function (set) {
        var $el = set.get('$el');
        if ($el) {
            $el.remove();
        }
        this.updateEmptyMessage();
    },
    remove: function () {
    },
    /** Recreates the UI; do not call during interactions. */
    refresh: function () {
        this.setsContainer.empty();
        this.collection.each(this.addSet, this);
    },
    addSetFromSelection: function (/*evt*/) {
        //var $target = $(evt.currentTarget);
        var vizSet = new VizSetModel({});
        this.panel.activeSelection.take(1).do(function (activeSelection) {
            vizSet.fromVizSelection(activeSelection);
        }.bind(this)).subscribe(
            _.identity, util.makeErrorHandler('Getting the selection as a Set'));
        this.collection.push(vizSet);
    }
});

function SetsPanel(socket/*, urlParams*/) {
    this.collection = new VizSetCollection([]);

    this.commands = {
        getAll: new Command('getting sets', 'get_sets', socket),
        create: new Command('creating a set', 'create_set', socket),
        update: new Command('updating a set', 'update_set', socket)
    };

    this.model = VizSetModel;

    this.view = new AllVizSetsView({
        collection: this.collection,
        el: $('#setsPanel'),
        panel: this
    });

    this.commands.getAll.sendWithObservableResult().do(
        function (response) {
            var sets = response.sets;
            _.each(sets, function (vizSet) {
                this.collection.add(new VizSetModel(vizSet));
            }.bind(this));
        }.bind(this)).subscribe(
            _.identity,
            util.makeErrorHandler(this.commands.getAll.description));
}

SetsPanel.prototype.updateSet = function (vizSetModel) {
    return this.commands.update.sendWithObservableResult(vizSetModel.id, vizSetModel);
};

/**
 * @param {Rx.ReplaySubject} activeSelection
 */
SetsPanel.prototype.setupSelectionInteraction = function (activeSelection, latestHighlightedObject) {
    this.activeSelection = activeSelection;
    this.latestHighlightedObject = latestHighlightedObject;
    this.activeSelection.do(function (activeSelection) {
        if (activeSelection.length === 0) {
            this.collection.each(function (vizSet) { vizSet.isSelected(false); });
        }
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Clearing selection from canvas'));
};

/**
 * @param {VizSetModel[]} setModels
 */
SetsPanel.prototype.updateVizSelectionFrom = function (setModels, action) {
    var resultSetModel;
    if (setModels.length > 1) {
        resultSetModel = _.reduce(setModels, function (firstSet, secondSet) {
            return firstSet.union(secondSet);
        });
    } else if (setModels.length === 1) {
        resultSetModel = setModels[0];
    }
    var newSelection = resultSetModel === undefined ? [] : resultSetModel.asVizSelection();
    switch (action) {
        case 'highlight':
            this.latestHighlightedObject.onNext(newSelection);
            break;
        case 'select':
        default:
            this.activeSelection.onNext(newSelection);
            break;
    }
};

module.exports = SetsPanel;