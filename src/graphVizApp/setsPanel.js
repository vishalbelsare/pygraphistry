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
        if (mask === undefined) { return []; }
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
    getDescriptionForCounts: function (numPoints, numEdges) {
        var result = '';
        var hasPoints = numPoints > 0;
        if (hasPoints) {
            result += numPoints.toString(10) + ' point';
            if (numPoints > 1) { result += 's'; }
        }
        var hasEdges = numEdges > 0;
        if (hasPoints && hasEdges) {
            result += ' and ';
        }
        if (hasEdges) {
            result += numEdges.toString(10) + ' edge';
            if (numEdges > 1) { result += 's'; }
        }
        return result;
    },
    getGeneratedDescription: function (fullPhrase) {
        var setSource = this.get('setSource');
        var mask = this.get('mask');
        var result = '';
        if (setSource === 'selection') {
            if (mask === undefined) {
                result = 'A selection';
            } else {
                result = 'Selected ';
            }
        } else if (this.isSystem()) {
            switch (fullPhrase && this.id) {
                case 'dataframe':
                    result = 'Loaded ';
                    break;
                case 'filtered':
                    result = 'Filtered to ';
                    break;
                case 'selection':
                    result = 'Selected ';
                    break;
            }
        }
        if (mask === undefined) {
            var sizes = this.get('sizes');
            if (sizes === undefined) {
                result += 'unknown';
            } else {
                result += this.getDescriptionForCounts(sizes.point, sizes.edge);
            }
        } else {
            result += this.getDescriptionForCounts(mask.point.length, mask.edge.length);
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
        this.listenTo(this.model, 'change', this.render);
        this.template = Handlebars.compile($('#setTemplate').html());
        this.panel = options.panel;
        this.renameTemplate = Handlebars.compile($('#setTagTemplate').html());
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
    delete: function (/*event*/) {
        this.$el.remove();
        this.collection.remove(this.model);
    },
    rename: function (/*event*/) {
        var bindings = this.model.toJSON();
        var $modal = $(this.renameTemplate(bindings));
        $('body').append($modal);
        $('.status', $modal).css('display', 'none');
        $modal.modal('show');
        Rx.Observable.fromEvent($('.modal-footer button', $modal), 'click')
            .map(_.constant($modal)).do(function ($modal) {
                var setTag = $('.modal-body input', $modal).val();
                this.model.set('title', setTag);
            }.bind(this)).subscribe(
            function () {
                $modal.remove();
            }, util.makeErrorHandler('Exception while setting set tag'));
    },
    toggleSelected: function () {
        this.model.isSelected(!this.model.isSelected());
    },
    highlight: function (/*event*/) {
        this.panel.highlightSetModels([this.model]);
    },
    unhighlight: function (/*event*/) {
        this.panel.highlightSetModels([]);
    }
});

var AllVizSetsView = Backbone.View.extend({
    events: {
        'click .addSetButton': 'createSet',
        'click .createSetDropdownOption': 'updateCreateSetSelection'
    },
    initialize: function (options) {
        this.listenTo(this.collection, 'add', this.addSet);
        this.listenTo(this.collection, 'remove', this.removeSet);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);
        this.listenTo(this.collection, 'change', this.updateVizSelectionFromSelectedSets);

        this.el = options.el;
        this.panel = options.panel;
        this.$setsContainer = $('#sets');
        this.$emptyMessage = $('#setsEmptyMessage');
        this.$setsControlButton = $('#setsPanelButton');
        this.$createSetContainer = $('.setsPanelToolbar', this.el);
        this.createSetTemplate = Handlebars.compile($('#setCreateTemplate').html());
        this.createSetSelection = 'selected';

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
            this.panel.selectSetModels(currentlySelectedSets);
            this.lastSetSelection = currentlySelectedSets;
        }
    },
    render: function () {
        var visibleModels = this.visibleSets();
        $('.badge', this.$setsControlButton).text(visibleModels.length > 0 ? visibleModels.length : '');
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
        this.$setsContainer.append(childElement);
        set.set('$el', $(childElement));
        this.updateEmptyMessage();
    },
    updateEmptyMessage: function () {
        this.$emptyMessage.toggleClass('hidden', this.visibleSets().length > 0);
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
    refreshCreateSet: function () {
        var initialSelection = this.collection.find(function (vizSet) {
                return vizSet.id === this.createSetSelection;
            }.bind(this)) || new VizSetModel({title: 'Selected', id: this.createSetSelection});
        var $createSet = $(this.createSetTemplate({
            selectedOption: initialSelection.get('title'),
            options: this.collection.select(function (vizSet) { return vizSet.isSystem(); }).map(function (vizSet) {
                return VizSetView.prototype.bindingsFor(vizSet);
            })
        }));
        $('.createSetDropdown', this.$createSetContainer).remove();
        this.$createSetContainer.append($createSet);
    },
    /** Recreates the UI; do not call during interactions. */
    refresh: function () {
        this.$setsContainer.empty();
        this.collection.each(this.addSet, this);
    },
    updateCreateSetSelection: function (evt) {
        var $target = $(evt.currentTarget);
        var vizSetID = $target.data('id');
        var vizSet = this.collection.find(function (vizSet) { return vizSet.id === vizSetID; });
        if (vizSet !== undefined) {
            this.createSetSelection = vizSet.id;
            $('.createSetSelectionTitle', this.$createSetContainer).text(vizSet.title);
            this.refreshCreateSet();
        }
    },
    createSet: function (/*evt*/) {
        //var $target = $(evt.currentTarget);
        var vizSet = new VizSetModel({});
        switch (this.createSetSelection) {
            case 'selection':
                this.panel.activeSelection.take(1).do(function (activeSelection) {
                    vizSet.fromVizSelection(activeSelection);
                }.bind(this)).subscribe(
                    _.identity, util.makeErrorHandler('Getting the selection as a Set'));
                break;
            case 'filtered':
                break;
            case 'dataframe':
                break;
        }
        this.collection.push(vizSet);
    }
});

function SetsPanel(socket/*, urlParams*/) {

    this.commands = {
        getAll: new Command('getting sets', 'get_sets', socket),
        create: new Command('creating a set', 'create_set', socket),
        update: new Command('updating a set', 'update_set', socket)
    };

    this.model = VizSetModel;

    this.collection = new VizSetCollection([]);

    this.view = new AllVizSetsView({
        collection: this.collection,
        el: $('#setsPanel'),
        panel: this
    });
}

SetsPanel.prototype.refreshCollection = function () {
    this.commands.getAll.sendWithObservableResult().do(
        function (response) {
            var sets = response.sets;
            this.collection.reset(_.map(sets, function (vizSet) {
                return new VizSetModel(vizSet);
            }));
            console.dir(sets);
            this.view.refreshCreateSet();
        }.bind(this)).subscribe(
        _.identity,
        util.makeErrorHandler(this.commands.getAll.description));
};

SetsPanel.prototype.isVisible = function() { return this.view.$el.is(':visible'); };

SetsPanel.prototype.toggleVisibility = function (newVisibility) {
    if (newVisibility) {
        this.refreshCollection();
    }
    var $panel = this.view.el;
    $panel.toggle(newVisibility);
    $panel.css('visibility', newVisibility ? 'visible': 'hidden');
};

SetsPanel.prototype.setupToggleControl = function (toolbarClicks, $panelButton) {
    var panelToggles = toolbarClicks.filter(function (elt) {
        return elt === $panelButton[0];
    }).map(function () {
        // return the target state (boolean negate)
        return !this.isVisible();
    }.bind(this));
    this.togglesSubscription = panelToggles.do(function (newVisibility) {
        $panelButton.children('i').toggleClass('toggle-on', newVisibility);
        this.toggleVisibility(newVisibility);
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Turning on/off the sets panel'));
};

SetsPanel.prototype.dispose = function () {
    this.togglesSubscription.dispose();
};

SetsPanel.prototype.deleteSet = function (vizSetModel) {
    return this.commands.update.sendWithObservableResult(vizSetModel.id, undefined);
};

SetsPanel.prototype.updateSet = function (vizSetModel) {
    return this.commands.update.sendWithObservableResult(vizSetModel.id, vizSetModel);
};

/**
 * @param {Rx.ReplaySubject} activeSelection
 * @param {Rx.ReplaySubject} latestHighlightedObject
 */
SetsPanel.prototype.setupSelectionInteraction = function (activeSelection, latestHighlightedObject) {
    this.activeSelection = activeSelection;
    this.latestHighlightedObject = latestHighlightedObject;
    this.selectionIsEmpty = this.activeSelection.map(function (activeSelection) {
        return (activeSelection.length === 0);
    });
    this.selectionIsEmpty.do(function (isEmpty) {
        if (isEmpty) {
            this.collection.each(function (vizSet) { vizSet.isSelected(false); });
        }
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Clearing selection from canvas'));
};

SetsPanel.prototype.vizSelectionFromSetModels = function (setModels) {
    var resultSetModel;
    if (setModels.length > 1) {
        resultSetModel = _.reduce(setModels, function (firstSet, secondSet) {
            return firstSet.union(secondSet);
        });
    } else if (setModels.length === 1) {
        resultSetModel = setModels[0];
    }
    return resultSetModel === undefined ? [] : resultSetModel.asVizSelection();
};

SetsPanel.prototype.highlightSetModels = function (setModels) {
    this.latestHighlightedObject.onNext(this.vizSelectionFromSetModels(setModels));
};

SetsPanel.prototype.selectSetModels = function (setModels) {
    this.activeSelection.onNext(this.vizSelectionFromSetModels(setModels));
};

module.exports = SetsPanel;