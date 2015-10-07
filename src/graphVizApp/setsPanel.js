'use strict';

var $       = window.$;
//var _       = require('underscore');
//var Rx      = require('rx');
require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
Backbone.$ = $;
//var util          = require('./util.js');


var SetModel = Backbone.Model.extend({
    default: {
        title: undefined
    }
});

var SetCollection = Backbone.Collection.extend({
    model: SetModel
});

var SetView = Backbone.View.extend({
    tagName: 'div',
    className: 'setEntry',
    events: {
    },
    initialize: function (/*options*/) {
        this.listenTo(this.model, 'destroy', this.remove);
        this.template = Handlebars.compile($('#setTemplate').html());
    },
    render: function () {
        var bindings = this.model.toJSON();
        var html = this.template(bindings);
        this.$el.html(html);
        return this;
    }
});

var AllSetsView = Backbone.View.extend({
    events: {

    },
    initialize: function (options) {
        this.listenTo(this.collection, 'add', this.addSet);
        this.listenTo(this.collection, 'remove', this.removeSet);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);

        this.el = options.el;
        this.setsContainer = $('#sets');

        this.collection.each(this.addSet, this);
    },
    render: function () {
        var $setsControlButton = $('#setsButton');
        $setsControlButton.attr('data-count', this.collection.length);
        $setsControlButton.toggleClass('iconBadge', !this.collection.isEmpty());
        return this;
    },
    addSet: function (set) {
        var view = new SetView({
            model: set,
            collection: this.collection
        });
        var childElement =view.render().el;
        this.setsContainer.append(childElement);
        set.set('$el', $(childElement));
    },
    removeSet: function (set) {
        var $el = set.get('$el');
        if ($el) {
            $el.remove();
        }
    },
    remove: function () {
    },
    /** Recreates the UI; do not call during interactions. */
    refresh: function () {
        this.setsContainer.empty();
        this.collection.each(this.addSet, this);
    }
});

function SetsPanel(/*socket, urlParams*/) {
    this.collection = new SetCollection([]);

    this.model = SetModel;

    this.view = new AllSetsView({
        collection: this.collection,
        el: $('#setsPanel')
    });
}

module.exports = SetsPanel;