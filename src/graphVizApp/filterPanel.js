'use strict';

var $       = window.$;
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl = require('./filter.js');


var COLLAPSED_FILTER_HEIGHT = 80;

var FilterModel = Backbone.Model.extend({
    defaults: {
        title: undefined,
        attribute: undefined,
        dataType: undefined,
        controlType: undefined,
        query: undefined
    }
});

var FilterCollection = Backbone.Collection.extend({
    model: FilterModel,
    matchElement: function (filterModel) {
        if (filterModel.has('control')) {
            return this.findWhere({control: filterModel.get('control'), attribute: filterModel.get('attribute')});
        } else if (filterModel.has('title')) {
            return this.findWhere({title: filterModel.get('title')});
        } else if (filterModel.has('attribute')) {
            return this.findWhere({attribute: filterModel.get('attribute')});
        } else {
            return undefined;
        }
    },
    updateSubset: function (updatedCollection) {
        _.each(updatedCollection, function (filterModel/*, idx*/) {
            var match = this.matchElement(filterModel);
            if (match) {
                match.set(filterModel.toJSON());
            } else {
                this.add(filterModel);
            }
        }, this);
    }
});

/**
 * This is not the underlying data type but the logical type for the query.
 * @type {{name: String, value: String}}[]
 */
var DataTypes = [
    {value: 'string', name: 'String'},
    {value: 'number', name: 'Numeric'}, // decimal
    {value: 'float', name: 'Float'},
    {value: 'date', name: 'Date'},
    {value: 'datetime', name: 'Date and Time'},
    {value: 'boolean', name: 'Boolean'},
    {value: 'categorical', name: 'Categorical'}
];

/**
 * What kinds of controls can be selected at top-level (then configured/styled).
 * TODO make these parametric or hierarchical.
 * @type {{name: String, value: String}}[]
 */
var FilterControlTypes = [
    {value: 'select', name: 'Select'},
    // Might include All and/or None:
    {value: 'multiselect', name: 'Multi-Select'},
    // Single vs double-bounded range:
    {value: 'range', name: 'Range'},
    // Continuous vs discrete slider:
    {value: 'slider', name: 'Slider'},
    {value: 'histogram', name: 'Histogram'},
    {value: 'calendar', name: 'Calendar'},
    // Role of text (substring vs prefix or blob).
    {value: 'text', name: 'Text'}
];

var FilterView = Backbone.View.extend({
    tagName: 'div',
    className: 'filterInspector',
    events: {
        'click .disableFilterButton': 'disable',
        'click .expandFilterButton': 'expand',
        'click .expendedFilterButton': 'shrink'
    },

    initialize: function () {
        this.listenTo(this.model, 'destroy', this.remove);
        this.template = Handlebars.compile($('#filterTemplate').html());
    },
    render: function () {
        var control = new FilterControl();
        var bindings = {
            model: _.extend({
                    expression: control.queryToExpression(this.model.get('query'))
                },
                this.model.toJSON()),
            dataTypes: _.map(DataTypes, function (dataType) {
                if (dataType.value === this.model.get('dataType')) {
                    return _.extend({selected: true}, dataType);
                }
                return dataType;
            }, this),
            controlTypes: _.map(FilterControlTypes, function (controlType) {
                if (controlType.value === this.model.get('controlType')) {
                    return _.extend({selected: true}, controlType);
                }
                return controlType;
            }, this)
        };
        var html = this.template(bindings);
        this.$el.html(html);

        return this;
    },
    expand: function (event) {
        $(event.target).removeClass('expandFilterButton').addClass('expandedFilterButton');
    },
    shrink: function (event) {
        $(event.target).removeClass('expandedFilterButton').addClass('expandFilterButton');
        this.$el.css('height', COLLAPSED_FILTER_HEIGHT);
    }
});

var AllFiltersView = Backbone.View.extend({
    initialize: function () {
        this.listenTo(this.collection, 'add', this.addFilter);
        this.listenTo(this.collection, 'remove', this.removeFilter);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);
        this.listenTo(this.collection, 'change:timestamp', this.update);

        this.filtersContainer = $('#filters');
    },
    render: function () {
    },
    addFilter: function (filter) {
        var view = new FilterView({
            model: filter,
            template: this.filterTemplate
        });
        var childElement = view.render().el;
        // var dataframeAttribute = filter.get('attribute');
        this.filtersContainer.append(childElement);
        filter.set('$el', $(childElement));
    },
    remove: function () {
        this.combinedSubscription.dispose();
    },
    removeFilter: function (/*filter*/) {
    },
    refresh: function () {
        this.filtersContainer.empty();
        this.collection.each(this.addFilter, this);
    },
    update: undefined
});


function FilterPanel(socket, urlParams, filtersSubjectFromPanel, filtersSubjectFromHistogram) {
    var $button = $('#filterButton');

    if (!urlParams.debug) {
        $button.css({display: 'none'});
    }

    this.control = new FilterControl(socket);

    this.collection = new FilterCollection();

    this.model = FilterModel;

    filtersSubjectFromHistogram.do(function (histogramFilters) {
        this.collection.updateSubset(histogramFilters);
    }.bind(this)).subscribe(_.identity, function (err) {
        console.error('error updating filters collection from histograms', err);
    });

    this.collection.on('change', function (eventName, context) {
        filtersSubjectFromPanel.onNext(context);
    }.bind(this));

    this.combinedSubscription = this.control.namespaceMetadataObservable().combineLatest(
        filtersSubjectFromPanel,
        function (dfa, fs) {
            return {dataframeAttributes: dfa, filterSet: fs};
        }).do(function (data) {
            // Setup add filter button.
            var addFilterTemplate = Handlebars.compile($('#addFilterTemplate').html());
            // TODO flatten the namespace into selectable elements:
            var params = {fields: data.dataframeAttributes};
            var html = addFilterTemplate(params);
            $('#addFilter').html(html);
        }).subscribe(function (data) { console.log(data); }, function (err) {
            console.log('Error updating Add Filter', err);
        });

    this.view = new AllFiltersView({
        collection: this.collection,
        el: $('#filtersPanel')
    });
}

module.exports = FilterPanel;
