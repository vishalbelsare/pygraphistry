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
        });
    }
});

var DataTypes = [
    {name: 'string'},
    {name: 'number'},
    {name: 'date'},
    {name: 'datetime'},
    {name: 'boolean'},
    {name: 'categorical'}
];

var FilterControlTypes = [
    {name: 'select'},
    {name: 'multiselect'},
    {name: 'range'},
    {name: 'slider'},
    {name: 'calendar'},
    {name: 'text'}
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
    },
    render: function () {
        var html = this.template({
            model: this.model.toJSON(),
            dataTypes: _.map(DataTypes, function (dataType) {
                if (dataType.name === this.model.get('dataType')) {
                    return _.extend({selected: true}, dataType);
                }
                return dataType;
            }, this),
            controlTypes: _.map(FilterControlTypes, function (controlType) {
                if (controlType.name === this.model.get('controlType')) {
                    return _.extend({selected: true}, controlType);
                }
                return controlType;
            }, this)
        });
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
        this.filterTemplate = Handlebars.compile($('#filterTemplate').html());
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
