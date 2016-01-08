'use strict';

var $       = window.$;
var _       = require('underscore');
var Rx      = require('rx');
              require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl       = require('./FilterControl.js');
var QuerySelectionModel = require('./QuerySelectionModel.js');
var ExpressionEditor    = require('./expressionEditor.js');
var util          = require('./util.js');


var COLLAPSED_EXCLUSION_HEIGHT = 80;


var ExclusionModel = QuerySelectionModel.extend({
});

var ExclusionCollection = Backbone.Collection.extend({
    model: ExclusionModel,
    control: undefined,
    namespaceMetadata: undefined,
    addExclusion: function(attributes) {
        if (!attributes.title) {
            attributes.title = attributes.attribute;
        }
        var newExclusion = new ExclusionModel(attributes);
        this.push(newExclusion);
    }
});

var ExclusionView = Backbone.View.extend({
    tagName: 'div',
    className: 'exclusionInspector',
    events: {
        'click .disableExclusionButton': 'disable',
        'click .disabledExclusionButton': 'enable',
        'click .expandExclusionButton': 'expand',
        'click .expendedExclusionButton': 'shrink',
        'click .deleteExclusionButton': 'delete',
        'change textarea.exclusionExpression': 'updateQuery'
    },

    initialize: function (options) {
        this.control = options.control;
        this.listenTo(this.model, 'destroy', this.remove);
        this.template = Handlebars.compile($('#exclusionTemplate').html());
    },
    render: function () {
        var bindings = {
            model: _.extend({
                    placeholder: this.control.queryToExpression(this.model.placeholderQuery())
                },
                this.model.toJSON())
        };
        var html = this.template(bindings);
        this.$el.html(html);

        this.initEditor();
        return this;
    },
    initEditor: function () {
        if (this.editor !== undefined) { return; }

        this.$expressionArea = this.$('.exclusionExpression');

        this.editor = new ExpressionEditor(this.$expressionArea[0]);
        var readOnly = this.model.get('controlType') !== undefined;
        this.editor.setReadOnly(readOnly);
        this.$expressionArea.toggleClass('disabled', readOnly);
        this.$el.toggleClass('disabled', readOnly);
        if (readOnly) {
            this.listenTo(this.model, 'change', function () {
                var inputString = this.model.get('query').inputString;
                if (inputString !== undefined) {
                    this.editor.session.setValue(inputString);
                }
            });
        }
        this.control.namespaceMetadataObservable().filter(function (namespaceMetadata) {
            return namespaceMetadata !== undefined;
        }).subscribe(function (namespaceMetadata) {
            this.editor.dataframeCompleter.setNamespaceMetadata(namespaceMetadata);
        }.bind(this));
        var expression = this.model.getExpression(this.control);
        if (expression) {
            this.editor.session.setValue(expression);
        }
        this.editor.session.on('change', function (aceEvent) {
            this.updateQuery(this.editor.editor.getValue(), aceEvent);
        }.bind(this));
    },
    updateQuery: function (expressionString, aceEvent) {
        var annotation;
        try {
            this.model.updateExpression(this.control, expressionString);
        } catch (syntaxError) {
            if (syntaxError) {
                var row = syntaxError.line && syntaxError.line - 1;
                var startColumn = syntaxError.column;
                if (aceEvent && aceEvent.lines[row].length <= startColumn) {
                    startColumn--;
                }
                annotation = this.editor.newInlineAnnotation({
                    row: row,
                    column: startColumn,
                    endColumn: startColumn + 1,
                    text: syntaxError.message,
                    type: 'error'
                });
            } else {
                annotation = this.editor.newInlineAnnotation({
                    text: 'Unknown',
                    type: 'warning'
                });
            }
        }
        this.editor.clearAnnotationsAndMarkers();
        if (annotation === undefined) {
            this.$expressionArea.attr('title', 'Exclusion expression');
        } else {
            this.$expressionArea.attr('title', annotation.text);
            this.editor.session.setAnnotations([annotation]);
        }
    },
    delete: function (/*event*/) {
        this.$el.remove();
        this.collection.remove(this.model);
    },
    disable: function (event) {
        var $button = $(event.target);
        $button.removeClass('disableExclusionButton').addClass('disabledExclusionButton');
        $button.removeClass('fa-toggle-on').addClass('fa-toggle-off');
        $button.attr('title', 'Disabled');
        $('input', this.$el).attr('disabled');
        $('select', this.$el).attr('disabled');
        $('textarea', this.$el).attr('disabled');
        this.model.set('enabled', false);
    },
    enable: function (event) {
        var $button = $(event.target);
        $button.removeClass('disabledExclusionButton').addClass('disableExclusionButton');
        $button.removeClass('fa-toggle-off').addClass('fa-toggle-on');
        $button.attr('title', 'Enabled');
        $('input', this.$el).removeAttr('disabled');
        $('select', this.$el).removeAttr('disabled');
        $('textarea', this.$el).removeAttr('disabled');
        this.model.set('enabled', true);
    },
    expand: function (event) {
        $(event.target).removeClass('expandExclusionButton').addClass('expandedExclusionButton');
    },
    shrink: function (event) {
        $(event.target).removeClass('expandedExclusionButton').addClass('expandExclusionButton');
        this.$el.css('height', COLLAPSED_EXCLUSION_HEIGHT);
    }
});

var AllExclusionsView = Backbone.View.extend({
    events: {
        'click .addExclusionButton': 'addExclusionFromButton'
    },
    initialize: function (options) {
        this.control = options.control;
        this.listenTo(this.collection, 'add', this.addExclusion);
        this.listenTo(this.collection, 'remove', this.removeExclusion);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);

        this.el = options.el;
        this.exclusionsContainer = $('#exclusions');

        this.collection.each(this.addExclusion, this);
    },
    render: function () {
        var $exclusionButton = $('#exclusionButton');
        var numElements = this.collection.length;
        $('.badge', $exclusionButton).text(numElements > 0 ? numElements : '');
        return this;
    },
    addExclusion: function (exclusion) {
        var view = new ExclusionView({
            model: exclusion,
            collection: this.collection,
            control: this.control
        });
        var childElement = view.render().el;
        // var dataframeAttribute = exclusion.get('attribute');
        this.exclusionsContainer.append(childElement);
        exclusion.set('$el', $(childElement));
    },
    removeExclusion: function (exclusion) {
        var $el = exclusion.get('$el');
        if ($el) {
            $el.remove();
        }
    },
    addExclusionFromButton: function (evt) {
        this.collection.addExclusion({});
    },
    remove: function () {
        this.combinedSubscription.dispose();
    },
    /** Recreates the UI; do not call during interactions. */
    refresh: function () {
        this.exclusionsContainer.empty();
        this.collection.each(this.addExclusion, this);
    }
});

// Used to attach attributes to Add Exclusion dropdown:
Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context);
});


function ExclusionsPanel(socket, control, labelRequests) {
    //var $button = $('#exclusionButton');

    if (control === undefined) {
        control = new FilterControl(socket);
    }
    this.control = control;

    var that = this;

    this.labelRequestSubscription = labelRequests.filter(function (labelRequest) {
        return labelRequest.exclude_query !== undefined;
    }).do(function (labelRequest) {
        var exclusion = labelRequest.exclude_query;
        that.collection.add(new ExclusionModel(exclusion));
    }).subscribe(_.identity, util.makeErrorHandler('Handling an exclusion from a label'));

    this.control.exclusionsResponsesSubject.take(1).do(function (exclusions) {
        _.each(exclusions, function (exclusion) {
            that.collection.add(new ExclusionModel(exclusion));
        });
    }).subscribe(_.identity, util.makeErrorHandler('Reading exclusions from workbook'));
    this.collection = new ExclusionCollection([], {
        control: this.control
    });

    this.model = ExclusionModel;

    /** Exposes changes to the ExclusionCollection. */
    this.exclusionsSubject = new Rx.ReplaySubject(1);
    // Seed with a fresh exclusions list. Should come from persisted state.
    this.collection.on('change reset add remove', function (/*model, options*/) {
        that.exclusionsSubject.onNext(that.collection);
    });

    this.exclusionsSubject.subscribe(
        function (collection) {
            that.control.updateExclusions(collection.map(function (model) {
                return _.omit(model.toJSON(), '$el');
            }));
        },
        util.makeErrorHandler('updateExclusions on exclusions change event')
    );

    var namespaceMetadataObservable = this.control.namespaceMetadataObservable();
    this.combinedSubscription = namespaceMetadataObservable.combineLatest(
        this.exclusionsSubject,
        function (dfa, fs) {
            return {dataframeAttributes: dfa, exclusionSet: fs};
        }).do(function (data) {
            // Setup add exclusion button.
            var addExclusionTemplate = Handlebars.compile($('#addExclusionTemplate').html());
            // TODO flatten the namespace into selectable elements:
            var fields = [];
            _.each(data.dataframeAttributes, function (columns, typeName) {
                _.each(columns, function (column, attributeName) {
                    // PATCH rename "type" to "dataType" to avoid collisions:
                    if (column.hasOwnProperty('type') && !column.hasOwnProperty('dataType')) {
                        column.dataType = column.type;
                        delete column.type;
                    }
                    fields.push(_.extend({type: typeName, name: attributeName}, column));
                });
            });
            var params = {fields: fields};
            var html = addExclusionTemplate(params);
            $('#addExclusion').html(html);
        }).subscribe(_.identity, function (err) {
            console.log('Error updating Add Exclusion', err);
        });

    this.view = new AllExclusionsView({
        collection: this.collection,
        control: this.control,
        el: $('#exclusionsPanel')
    });
}

ExclusionsPanel.prototype.isVisible = function () { return this.view.$el.is(':visible'); };

ExclusionsPanel.prototype.toggleVisibility = function (newVisibility) {
    var $panel = this.view.el;
    $panel.toggle(newVisibility);
    $panel.css('visibility', newVisibility ? 'visible': 'hidden');
};

ExclusionsPanel.prototype.setupToggleControl = function (toolbarClicks, $panelButton) {
    var panelToggles = toolbarClicks.filter(function (elt) {
        return elt === $panelButton[0];
    }).map(function () {
        // return the target state (boolean negate)
        return !this.isVisible();
    }.bind(this));
    this.togglesSubscription = panelToggles.do(function (newVisibility) {
        $panelButton.children('i').toggleClass('toggle-on', newVisibility);
        this.toggleVisibility(newVisibility);
    }.bind(this)).subscribe(_.identity, util.makeErrorHandler('Turning on/off the exclusion panel'));
};

ExclusionsPanel.prototype.dispose = function () {
    this.exclusionsSubject.dispose();
    this.togglesSubscription.dispose();
    this.labelRequestSubscription.dispose();
};


module.exports = ExclusionsPanel;
