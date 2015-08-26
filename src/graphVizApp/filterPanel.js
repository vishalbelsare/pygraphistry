'use strict';

var $       = window.$;
/*
var Rx      = require('rx');
              require('../rx-jquery-stub');
var _       = require('underscore');
*/
var Backbone = require('backbone');
    Backbone.$ = $;

module.exports = {
    init: function () {
        var $filterPanel = $('#filteringItems');

        var FilterModel = Backbone.Model.extend({});
        var FilterCollection = Backbone.Collection.extend({
            model: FilterModel
        });
        var filterSet = new FilterCollection();

        var AllFiltersView = Backbone.View.extend({
            el: $filterPanel,
            filtersContainer: $('#filters'),
            initialize: function () {
                this.listenTo(filterSet, 'add', this.addFilter);
                this.listenTo(filterSet, 'remove', this.removeFilter);
                this.listenTo(filterSet, 'reset', this.clear);
                this.listenTo(filterSet, 'all', this.render);
                this.listenTo(filterSet, 'change:timestamp', this.update);
            },
            render: function () {

            },
            addFilter: undefined,
            removeFilter: undefined,
            clear: undefined,
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
