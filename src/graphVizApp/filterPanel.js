'use strict';

var $       = window.$;
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
var Ace     = require('brace');

module.exports = {
    init: function () {
        var $filterPanel = $('#filtersPanel');

        var FilterModel = Backbone.Model.extend({});
        var FilterCollection = Backbone.Collection.extend({
            model: FilterModel
        });
        var filterSet = new FilterCollection();

        var FilterView = Backbone.View.extend({
            tagName: 'div',
            className: 'filterInspector',
            template: Handlebars.compile($('#filterTemplate').html()),
            events: {
                'click .disableFilterButton': 'disable',
                'click .expandFilterButton': 'expand',
                'click .expendedFilterButton': 'shrink'
            }
        });

        var AllFiltersView = Backbone.View.extend({
            el: $filterPanel,
            filtersContainer: $('#filters'),
            initialize: function () {
                this.listenTo(filterSet, 'add', this.addFilter);
                this.listenTo(filterSet, 'remove', this.removeFilter);
                this.listenTo(filterSet, 'reset', this.refresh);
                this.listenTo(filterSet, 'all', this.render);
                this.listenTo(filterSet, 'change:timestamp', this.update);
            },
            render: function () {

            },
            addFilter: undefined,
            removeFilter: undefined,
            refresh: function () {
                $(this.filtersContainer).empty();
                filterSet.each(this.addFilter, this);
            },
            update: undefined
        });

        var allFiltersView = new AllFiltersView();

        return {
            view: allFiltersView,
            collection: filterSet,
            model: FilterModel
        };
    }
};
