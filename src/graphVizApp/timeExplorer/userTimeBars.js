
'use strict';

var debug   = require('debug')('graphistry:StreamGL:graphVizApp:TimeExplorer');
var $       = window.$;
var Rx      = require('rxjs/Rx.KitchenSink');
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

var QuerySelectionModel = require('../QuerySelectionModel.js');

var timeExplorerUtils = require('./timeExplorerUtils.js');
var timeBar = require('./timeBar.js');



var UserBarsModel = Backbone.Model.extend({});

var UserBarsCollection = Backbone.Collection.extend({
    model: timeBar.model,
    comparator: 'position'
});

var UserBarsView = Backbone.View.extend({
    events: {
        'click #newAttrSubmitButton': 'submitNewAttr'
    },

    initialize: function () {

        this.$el = $('#timeExplorerBody');
        this.el = this.$el[0];

        this.listenTo(this.collection, 'add', this.addBar);
        this.listenTo(this.collection, 'remove', this.removeBar);
        this.listenTo(this.collection, 'reset', this.addAll);

        this.template = Handlebars.compile($('#timeExplorerBodyTemplate').html());

        this.render();
    },

    render: function () {
        // this.collection.sort(); //TODO
        var explorer = this.model.get('explorer');

        var newDiv = $('<div id="timeExplorerUserBarsRenderingContainer"></div>');

        // We empty out the div and reattach so that we can resort the elements without
        // having to rerender the svgs inside.
        this.$el.empty();
        this.$el.append(newDiv);

        this.collection.each(function (child) {
            // TODO: This guard is a hack. I don't know how to initialize backbone
            if (child.view) {
                newDiv.append(child.view.el);
                child.view.render();

            }
        });

        var params = {

        };
        var addRowHtml = this.template(params);
        newDiv.append(addRowHtml);

        this.$el.attr('cid', this.cid);
    },

    submitNewAttr: function (evt) {
        evt.preventDefault();
        var explorer = this.model.get('explorer');
        explorer.addActiveQuery(undefined, undefined, '');
        return;


        var newType = $('#newType').val();
        var newAttr = $('#newAttr').val();
        var newQuery = $('#newQuery').val();
        // TODO: Don't use this global. Instead properly structure user bars as a model, that contains a collection.

        explorer.addActiveQuery(newType, newAttr, newQuery);
        // this.collection.get('explorer').addActiveQuery(newType, newAttr, newQuery);
    },

    addBar: function (model) {
        console.log('Adding Bar');
        var view = new timeBar.view({model: model});
        model.view = view;
        // this.$el.append(view.el);
        // view.render();
        this.render();
    },

    removeBar: function () {
        //TODO
        console.log('ATTEMPTING TO REMOVE USER BAR, NOT IMPLEMENTED YET');
    },

    addAll: function () {
        // this.$el.empty();
        this.collection.each(this.addBar, this);
        this.render();
    }

    /*
    mousemoveParent: function (evt) {
        this.collection.each(function (child) {
            if (child.view) {
                child.view.mousemoveParent(evt);
            }
        });
    },

    mouseoutParent: function (evt) {
        this.collection.each(function (child) {
            if (child.view) {
                child.view.mouseoutParent(evt);
            }
        });
    }
    */

});


module.exports = {
    model: UserBarsModel,
    view: UserBarsView,
    collection: UserBarsCollection
};