'use strict';

var $       = window.$;
//var _       = require('underscore');
var Rx      = require('rxjs/Rx');
require('../rx-jquery-stub');
const Handlebars = require('handlebars');
const Backbone   = require('backbone');
      Backbone.$ = $;
const _          = require('underscore');
const util       = require('./util.js');
const Command    = require('./command.js');
const VizSlice   = require('./VizSlice.js');


function unionOfTwoMasks (x, y) {
    // TODO: this is a copy of DataframeMask.unionOfTwoMasks. de-duplicate through common code-share.
    const xLength = x.length, yLength = y.length;
    // Smallest result: one is a subset of the other.
    const result = new Array(Math.max(xLength, yLength));
    let xIndex = 0, yIndex = 0, resultIndex = 0;
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


const MasksProperty = 'masks';


const VizSetModel = Backbone.Model.extend({
    default: {
        title: undefined,
        description: undefined
    },
    /**
     * @returns {VizSliceElement[]}
     */
    asVizSlice: function () {
        const mask = this.get(MasksProperty);
        return new VizSlice({point: mask.point, edge: mask.edge});
    },
    updateMaskFromVizSlice: function (mask, slice) {
        slice.forEachIndexAndDim((idx, dim) => {
            switch (dim) {
                case 1:
                    mask.point.push(idx);
                    break;
                case 2:
                    mask.edge.push(idx);
                    break;
                default:
                    throw Error('Unrecognized dimension in selection: ' + dim);
            }
        });
        mask.point = _.uniq(mask.point.sort(), true);
        mask.edge = _.uniq(mask.edge.sort(), true);
    },
    maskFromVizSlice: function (slice) {
        if (slice._isMaskShaped()) {
            return _.pick(slice, ['point', 'edge']);
        } else {
            const mask = {point: [], edge: []};
            this.updateMaskFromVizSlice(mask, slice);
            return mask;
        }
    },
    /**
     * @param {VizSlice} slice
     */
    fromVizSlice: function (slice) {
        let mask = this.get(MasksProperty);
        if (mask === undefined) {
            mask = {point: [], edge: []};
            this.set(MasksProperty, mask);
        } else {
            // Avoid in-place mutation because we copy masks via cloning:
            mask.point = [];
            mask.edge = [];
        }
        this.updateMaskFromVizSlice(mask, slice);
    },
    /**
     * @param {VizSetModel} otherSet
     * @returns {VizSetModel}
     */
    union: function (otherSet) {
        const result = new VizSetModel();
        if (!this.isConcrete() || !otherSet.isConcrete()) {
            throw Error('Cannot perform union on abstract set');
        }
        const resultMask = {}, thisMask = this.get(MasksProperty), otherMask = otherSet.get(MasksProperty);
        resultMask.point = unionOfTwoMasks(thisMask.point, otherMask.point);
        resultMask.edge = unionOfTwoMasks(thisMask.edge, otherMask.edge);
        result.set(MasksProperty, resultMask);
        return result;
    },
    isSystem: function () {
        return this.get('level') === 'system';
    },
    representsActiveSelection: function () {
        return this.isSystem() && this.id === 'selection';
    },
    isSelected: function (newValue) {
        if (newValue !== undefined) {
            this.set('selected', newValue);
        }
        return this.get('selected');
    },
    isConcrete: function () {
        const mask = this.get(MasksProperty);
        return mask !== undefined && mask.point !== undefined && mask.edge !== undefined;
    },
    isEmpty: function () {
        const sizes = this.get('sizes');
        if (this.isConcrete()) {
            const mask = this.get(MasksProperty);
            return mask.point.length === 0 && mask.edge.length === 0;
        } else if (sizes !== undefined) {
            return sizes.point === 0 && sizes.edge.length === 0;
        } else {
            return !this.isSystem();
        }
    },
    getDescriptionForCounts: function (numPoints, numEdges) {
        let result = '';
        const hasPoints = numPoints > 0;
        if (hasPoints) {
            result += numPoints.toString(10) + ' point';
            if (numPoints > 1) { result += 's'; }
        }
        const hasEdges = numEdges > 0;
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
        const setSource = this.get('setSource');
        const mask = this.get(MasksProperty);
        let result = '';
        if (this.isSystem()) {
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
        } else if (setSource === 'selection') {
            if (mask === undefined) {
                result = 'A selection';
            } else {
                result = 'Selected ';
            }
        }
        const sizes = this.get('sizes');
        if (mask === undefined) {
            if (sizes === undefined) {
                result += 'empty';
            } else {
                result += this.getDescriptionForCounts(sizes.point, sizes.edge);
            }
        } else {
            const numPoints = mask.point !== undefined ? mask.point.length : sizes && sizes.point;
            const numEdges = mask.edge !== undefined ? mask.edge.length : sizes && sizes.edge;
            result += this.getDescriptionForCounts(numPoints, numEdges);
        }
        return result;
    },
    sync: function (method, model, options) {
        if (options === undefined) { options = {}; }
        const success = options.success,
            panel = options.panel;
        switch (method) {
            case 'read':
                panel.getAllSets().take(1).subscribe(
                    function (latestSets) {
                        if (model.isNew()) { return; }
                        const match = _.find(latestSets, (vizSet) => vizSet.id === model.id);
                        if (match !== undefined) {
                            model.set(match);
                        }
                    },
                    util.makeErrorHandler('Getting latest Sets'));
                break;
            case 'delete':
                panel.deleteSet(model.toJSON()).subscribe((response) => {
                    if (typeof success === 'function') {
                        success.call(options.context, model, response, options);
                    }
                }, util.makeErrorHandler('Deleting a Set'));
                break;
            case 'update':
                // TODO handle options.patch
                panel.updateSet(model.toJSON()).subscribe((response) => {
                    if (response.success === true && response.set !== undefined) {
                        model.set(response.set);
                    }
                    if (typeof success === 'function') {
                        success.call(model, response, options);
                    }
                }, util.makeErrorHandler('Updating a Set'));
                break;
        }
    }
});

const VizSetCollection = Backbone.Collection.extend({
    model: VizSetModel
});

const VizSetView = Backbone.View.extend({
    tagName: 'div',
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
        const bindings = vizSet.toJSON();
        bindings.isSystem = vizSet.isSystem();
        bindings.isEmpty = vizSet.isEmpty();
        if (!bindings.description) {
            bindings.description = vizSet.getGeneratedDescription();
        }
        bindings.selectionClass = bindings.selected ? 'bg-primary' : '';
        return bindings;
    },
    render: function () {
        const bindings = this.bindingsFor(this.model);
        const html = this.template(bindings);
        this.$el.html(html);
        $('[data-toggle="tooltip"]', this.$el).tooltip();
        return this;
    },
    delete: function (/*event*/) {
        this.$el.remove();
        this.model.destroy({panel: this.panel});
    },
    rename: function (event) {
        event.preventDefault();
        const bindings = this.model.toJSON();
        if (this.$renameDialog !== undefined && !this.$renameDialog.is(':visible')) {
            this.closeRenameDialog();
        }
        if (this.$renameDialog === undefined) {
            this.$renameDialog = $(this.renameTemplate(bindings));
            $('body').append(this.$renameDialog);
            const $status = $('.status', this.$renameDialog);
            $status.css('display', 'none');
            const $input = $('.modal-body input', this.$renameDialog);
            $input.val(this.model.get('title'));
            this.$renameDialog.on('shown.bs.modal', () => {
                $('input', this.$renameDialog).first().focus();
            });
            this.$renameDialog.modal('show');
            this.renameDialogSubscription = Rx.Observable.fromEvent($('.modal-footer button', this.$renameDialog), 'click')
                .map(_.constant(this.$renameDialog)).subscribe((/*$modal*/) => {
                    const setTag = $input.val();
                    this.model.save('title', setTag, {panel: this.panel});
                    this.closeRenameDialog();
                },
                (err) => {
                    util.makeErrorHandler('Exception while naming Set', err);
                    this.closeRenameDialog();
                });
        }
    },
    closeRenameDialog: function () {
        this.$renameDialog.modal('hide');
        // FIXME this should not be necessary:
        $('.modal-backdrop').remove();
        this.renameDialogSubscription.dispose();
        this.renameDialogSubscription = undefined;
        this.$renameDialog.remove();
        this.$renameDialog = undefined;
    },
    toggleSelected: function (/*event*/) {
        this.model.isSelected(!this.model.isSelected());
    },
    renderHover: function (hoverOn) {
        this.$el.toggleClass('bg-info', hoverOn);
    },
    highlight: function (/*event*/) {
        this.renderHover(true);
        this.panel.highlightSetModels([this.model]);
    },
    unhighlight: function (/*event*/) {
        this.renderHover(false);
        this.panel.highlightSetModels([]);
    }
});

const AllVizSetsView = Backbone.View.extend({
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
        this.createSetSelectionID = 'selection';

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
        return this.collection.select((vizSet) => this.shouldShow(vizSet));
    },
    selectedSets: function () {
        return this.collection.select((vizSet) => vizSet.isSelected());
    },
    systemSets: function () {
        return this.collection.select((vizSet) => vizSet.isSystem());
    },
    updateVizSelectionFromSelectedSets: function () {
        const currentlySelectedSets = this.selectedSets();
        if (!_.isEqual(currentlySelectedSets, this.lastSetSelection)) {
            this.panel.selectSetModels(currentlySelectedSets);
            this.lastSetSelection = currentlySelectedSets;
        }
    },
    render: function () {
        const visibleModels = this.visibleSets();
        $('.badge', this.$setsControlButton).text(visibleModels.length > 0 ? visibleModels.length : '');
        return this;
    },
    addSet: function (set) {
        if (!this.shouldShow(set)) {
            return;
        }
        const view = new VizSetView({
            model: set,
            collection: this.collection,
            panel: this.panel
        });
        const childElement = view.render().el;
        this.$setsContainer.append(childElement);
        set.set('$el', $(childElement));
        this.updateEmptyMessage();
    },
    updateEmptyMessage: function () {
        this.$emptyMessage.toggleClass('hidden', this.visibleSets().length > 0);
    },
    removeSet: function (set) {
        const $el = set.get('$el');
        if ($el) {
            $el.remove();
        }
        this.updateEmptyMessage();
    },
    remove: function () {
    },
    refreshCreateSet: function (activeSelection) {
        if (activeSelection !== undefined) {
            this.collection.each((vizSet) => {
                if (vizSet.representsActiveSelection()) {
                    vizSet.fromVizSlice(activeSelection);
                }
            });
        }
        const initialSelection = this.collection.findWhere({id: this.createSetSelectionID}) ||
            new VizSetModel({title: 'Selected', id: this.createSetSelectionID});
        const $createSet = $(this.createSetTemplate({
            disabled: initialSelection.isEmpty() && 'disabled',
            selectedOption: VizSetView.prototype.bindingsFor(initialSelection),
            options: this.systemSets().map((vizSet) => VizSetView.prototype.bindingsFor(vizSet))
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
        const $target = $(evt.currentTarget);
        const vizSetID = $target.data('id');
        const vizSet = this.collection.find((eachVizSet) => eachVizSet.id === vizSetID);
        if (vizSet !== undefined) {
            this.createSetSelectionID = vizSet.id;
            $('.createSetSelectionTitle', this.$createSetContainer).text(vizSet.title);
            this.panel.activeSelection.take(1).do((activeSelection) => {
                this.refreshCreateSet(activeSelection);
            }).subscribe(_.identity, util.makeErrorHandler('Refreshing Create Set'));
        }
    },
    createSet: function (/*evt*/) {
        const srcSystemSet = this.collection.find((vizSet) => vizSet.id === this.createSetSelectionID);
        if (srcSystemSet === undefined) {
            throw Error('Set creation failed; unknown source: ' + this.createSetSelectionID);
        }
        this.panel.createSetViaCommand(srcSystemSet);
    }
});

function SetsPanel(socket, labelRequests, toggle) {

    this.commands = {
        getAll: new Command('getting sets', 'get_sets', socket),
        create: new Command('creating a set', 'create_set', socket),
        update: new Command('updating a set', 'update_set', socket),
        select: new Command('selecting sets', 'select', socket),
        highlight: new Command('highlighting sets', 'highlight', socket)
    };

    this.model = VizSetModel;

    this.collection = new VizSetCollection([]);

    this.toggle = toggle;

    this.view = new AllVizSetsView({
        collection: this.collection,
        el: $('#setsPanel'),
        panel: this
    });

    this.labelRequestSubscription = labelRequests.filter(
        (labelRequest) => labelRequest.tagQuery !== undefined
    ).do((labelRequest) => {
        const setSpec = labelRequest.tagQuery;
        const setModel = new VizSetModel(setSpec);
        this.view.addSet(setModel);
    }).subscribe(_.identity, util.makeErrorHandler('Handling a filter from a label'));
}

SetsPanel.prototype = {
    createSetViaCommand: function (srcSystemSet) {
        const sourceType = srcSystemSet.id;
        switch (sourceType) {
            case 'selection':
                this.activeSelection.take(1).switchMap((activeSelection) => {
                    const specification = {masks: VizSetModel.prototype.maskFromVizSlice(activeSelection)};
                    return this.commands.create.sendWithObservableResult(sourceType, specification).do((createSetResult) => {
                        this.handleCreateSetResult(createSetResult);
                        // Reset selection now that we've captured them in a Set:
                        this.activeSelection.onNext(activeSelection.newEmpty());
                    });
                }).subscribe(
                    _.identity, util.makeErrorHandler('Creating a Set from Selection'));
                break;
            case 'filtered':
                this.filtersSubject.take(1).switchMap((filtersCollection) => {
                    const userFilters = filtersCollection.select((filter) => !filter.isSystem());
                    const specification = {
                        title: _.map(userFilters, (filter) => filter.get('query').inputString).join(' and '),
                        filters: userFilters,
                        masks: _.clone(srcSystemSet.get(MasksProperty))
                    };
                    return this.commands.create.sendWithObservableResult(sourceType, specification).do((createSetResult) => {
                        this.handleCreateSetResult(createSetResult);
                    });
                }).subscribe(
                    _.identity, util.makeErrorHandler('Creating a Set from Filters'));
                break;
            case 'dataframe':
                break;
        }
    },
    handleCreateSetResult: function (createSetResult) {
        if (createSetResult.success === false) {
            throw Error('Set creation failed.');
        }
        const createdSet = new VizSetModel(createSetResult.set);
        this.collection.push(createdSet);
    },

    getAllSets: function () {
        return this.commands.getAll.sendWithObservableResult();
    },

    refreshCollection: function () {
        Rx.Observable.combineLatest(
            this.getAllSets(),
            this.activeSelection,
            (response, activeSelection) => {
                const sets = response.sets;
                this.collection.reset(_.map(sets, (vizSet) => {
                    const setModel = new VizSetModel(vizSet);
                    if (setModel.representsActiveSelection()) {
                        setModel.fromVizSlice(activeSelection);
                    }
                    return setModel;
                }));
                this.view.refreshCreateSet(activeSelection);
            }).take(1).subscribe(
            _.identity,
            util.makeErrorHandler(this.commands.getAll.description));
    },

    isVisible: function () { return this.view.$el.is(':visible'); },

    toggleVisibility: function (newVisibility) {
        if (newVisibility) {
            this.refreshCollection();
        }
        this.toggle.onNext(newVisibility);
    },

    dispose: function () {
        this.togglesSubscription.dispose();
    },

    deleteSet: function (vizSetModel) {
        return this.commands.update.sendWithObservableResult(vizSetModel.id, undefined);
    },

    updateSet: function (vizSetModel) {
        return this.commands.update.sendWithObservableResult(vizSetModel.id, vizSetModel);
    },

    /**
     * @param {Rx.ReplaySubject} activeSelection
     * @param {Rx.ReplaySubject} latestHighlightedObject
     */
    setupSelectionInteraction: function (activeSelection, latestHighlightedObject) {
        /** @type {Rx.ReplaySubject} */
        this.activeSelection = activeSelection;
        /** @type {Rx.ReplaySubject} */
        this.latestHighlightedObject = latestHighlightedObject;
        this.activeSelection.do((latestSelection) => {
            if (latestSelection.isEmpty()) {
                this.collection.each((vizSet) => { vizSet.isSelected(false); });
            }
            this.view.refreshCreateSet(latestSelection);
        }).subscribe(_.identity, util.makeErrorHandler('Clearing selection from canvas'));
    },

    setupFiltersPanelInteraction: function (filtersPanel) {
        this.filtersSubject = filtersPanel.filtersSubject;
        filtersPanel.control.setsResponsesSubject.do((setsResponse) => {
            _.each(setsResponse, (updatedSet) => {
                const match = this.collection.find((existingSet) => existingSet.id === updatedSet.id);
                if (match !== undefined) {
                    match.set(updatedSet);
                }
            });
            this.view.refreshCreateSet();
        }).subscribe(_.identity, util.makeErrorHandler('Updating Sets from filter updates'));
    },

    vizSliceFromSetModels: function (setModels) {
        if (setModels.length > 1) {
            const resultSetModel = _.reduce(setModels, (firstSet, secondSet) => {
                return firstSet.union(secondSet);
            });
            return resultSetModel.asVizSlice();
        } else if (setModels.length === 1) {
            return setModels[0].asVizSlice();
        } else {
            return new VizSlice();
        }
    },

    highlightSetModels: function (setModels) {
        const allConcrete = _.every(setModels, (vizSet) => vizSet.isConcrete());
        if (allConcrete) {
            this.latestHighlightedObject.onNext(this.vizSliceFromSetModels(setModels));
        }
        if (false && setModels.length === 0 || !allConcrete) {
            const setIDs = _.map(setModels, (setModel) => setModel.id);
            this.commands.highlight.sendWithObservableResult({gesture: 'sets', action: 'replace', setIDs: setIDs}).do(
                Command.prototype.logErrorFromResponse
            ).subscribe(_.identity, util.makeErrorHandler('highlighting sets'));
        }
    },

    selectSetModels: function (setModels) {
        const allConcrete = _.every(setModels, (vizSet) => vizSet.isConcrete());
        if (allConcrete) {
            this.activeSelection.onNext(this.vizSliceFromSetModels(setModels));
        }
        if (setModels.length === 0 || !allConcrete) {
            const setIDs = _.map(setModels, (setModel) => setModel.id);
            this.commands.select.sendWithObservableResult({gesture: 'sets', action: 'replace', setIDs: setIDs});
        }
    }
};

module.exports = SetsPanel;
