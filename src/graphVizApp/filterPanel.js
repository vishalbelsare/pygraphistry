'use strict';

var $       = window.$;
//var Rx      = require('rx');
//              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl = require('./filter.js');


var COLLAPSED_FILTER_HEIGHT = 80;


module.exports = {
    init: function (socket, urlParams, filtersSubjectFromPanel, filtersSubjectFromHistogram) {
        var $filtersPanel = $('#filtersPanel');
        FilterControl(socket, urlParams, $('#filterButton'), $filtersPanel);

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
        var filterSet = new FilterCollection();

        var possibleDataTypes = [
            {name: 'string'},
            {name: 'number'},
            {name: 'date'},
            {name: 'datetime'},
            {name: 'boolean'},
            {name: 'categorical'}
        ];
        var possibleControlTypes = [
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
            template: Handlebars.compile($('#filterTemplate').html()),
            events: {
                'click .disableFilterButton': 'disable',
                'click .expandFilterButton': 'expand',
                'click .expendedFilterButton': 'shrink'
            },

            initialize: function () {
                this.listenTo(this.model, 'destroy', this.remove);
                var collection = this.model.collection;
                filtersSubjectFromHistogram.do(function (histogramFilters) {
                    collection.updateSubset(histogramFilters);
                }).subscribe(_.identity, function (err) {
                    console.error('error updating filters collection from histograms', err);
                });
            },
            render: function () {
                var html = this.template({
                    model: this.model.toJSON(),
                    dataTypes: _.map(possibleDataTypes, function (dataType) {
                        if (dataType.name === this.model.get('dataType')) {
                            return _.extend({selected: true}, dataType);
                        }
                        return dataType;
                    }, this),
                    controlTypes: _.map(possibleControlTypes, function (controlType) {
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
            el: $filtersPanel,
            filtersContainer: $('#filters'),
            initialize: function () {
                this.listenTo(filterSet, 'add', this.addFilter);
                this.listenTo(filterSet, 'remove', this.removeFilter);
                this.listenTo(filterSet, 'reset', this.refresh);
                this.listenTo(filterSet, 'all', this.render);
                this.listenTo(filterSet, 'change:timestamp', this.update);

                this.combinedSubscription = FilterControl.namespaceMetadataObservable().combineLatest(
                    filtersSubjectFromPanel,
                    function (dfa, fs) {
                        return {dataframeAttributes: dfa, filterSet: fs};
                    }).do(function (data) {
                        // Setup add filter button.
                        var template = Handlebars.compile($('#addFilterTemplate').html());
                        // TODO flatten the namespace into selectable elements:
                        var params = {fields: data.dataframeAttributes};
                        var html = template(params);
                        $('#addFilter').html(html);
                    }).subscribe(function (data) { console.log(data); }, function (err) {
                        console.log('Error updating Add Filter', err);
                    });
            },
            render: function () {
                filtersSubjectFromPanel.onNext(filterSet);
            },
            addFilter: function (filter) {
                var view = new FilterView({model: filter});
                var childElement = view.render().el;
                // var dataframeAttribute = filter.get('attribute');
                $(this.filtersContainer).append(childElement);
                filter.set('$el', $(childElement));
                filtersSubjectFromPanel.onNext(filterSet);
            },
            remove: function () {
                this.combinedSubscription.dispose();
            },
            removeFilter: function (/*filter*/) {
                filtersSubjectFromPanel.onNext(filterSet);
            },
            refresh: function () {
                $(this.filtersContainer).empty();
                filterSet.each(this.addFilter, this);
            },
            update: undefined
        });

        var allFiltersView = new AllFiltersView({collection: filterSet});

        return {
            view: allFiltersView,
            collection: filterSet,
            model: FilterModel
        };
    }
};
