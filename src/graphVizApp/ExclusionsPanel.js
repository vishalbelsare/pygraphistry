'use strict';

var $       = window.$;
var _       = require('underscore');
var Rx      = require('rxjs/Rx.KitchenSink');
              require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl       = require('./FilterControl.js');
var QuerySelectionModel = require('./QuerySelectionModel.js');
var ExpressionEditor    = require('./expressionEditor.js');
var util          = require('./util.js');


const COLLAPSED_EXCLUSION_HEIGHT = 80;


const ExclusionModel = QuerySelectionModel.extend({
});

const ExclusionCollection = Backbone.Collection.extend({
    model: ExclusionModel,
    control: undefined,
    namespaceMetadata: undefined,
    addExclusion: function(attributes) {
        if (!attributes.title) {
            attributes.title = attributes.attribute;
        }
        const newExclusion = new ExclusionModel(attributes);
        const match = this.find((exclusion) => _.isEqual(newExclusion.get('query'), exclusion.get('query')));
        if (match === undefined) {
            this.push(newExclusion);
        } else {
            match.set('enabled', true);
        }
    }
});

const ExclusionView = Backbone.View.extend({
    tagName: 'div',
    className: 'exclusionInspector container-fluid',
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
        this.listenTo(this.model, 'change', this.updateFromModel);
    },
    render: function () {
        const bindings = {
            model: _.extend({
                placeholder: this.control.queryToExpression(this.model.placeholderQuery())
            }, this.model.toJSON())
        };
        const html = this.template(bindings);
        this.$el.html(html);

        this.initEditor();
        $('[data-toggle="tooltip"]', this.$el).tooltip();
        return this;
    },
    isEditorReadOnly: function () {
        return this.model.get('controlType') !== undefined;
    },
    updateFromModel: function () {
        if (this.isEditorReadOnly()) {
            const inputString = this.model.get('query').inputString;
            if (inputString !== undefined) {
                this.editor.session.setValue(inputString);
            }
        }
    },
    initEditor: function () {
        if (this.editor !== undefined) { return; }

        this.$expressionArea = this.$('.exclusionExpression');

        this.editor = new ExpressionEditor(this.$expressionArea[0]);
        const readOnly = this.isEditorReadOnly();
        this.editor.setReadOnly(readOnly);
        this.$expressionArea.toggleClass('disabled', readOnly);
        this.$el.toggleClass('disabled', readOnly);
        this.control.namespaceMetadataObservable().filter((namespaceMetadata) => namespaceMetadata !== undefined)
            .subscribe((namespaceMetadata) => {
                this.editor.dataframeCompleter.setNamespaceMetadata(namespaceMetadata);
            });
        const expression = this.model.getExpression(this.control);
        if (expression) {
            this.editor.session.setValue(expression);
        }
        this.editor.session.on('change', (aceEvent) => {
            this.updateQuery(this.editor.editor.getValue(), aceEvent);
        });
    },
    updateQuery: function (expressionString, aceEvent) {
        let annotation;
        try {
            this.model.updateExpression(this.control, expressionString);
        } catch (syntaxError) {
            if (syntaxError) {
                const row = syntaxError.line && syntaxError.line - 1;
                let startColumn = syntaxError.column;
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
        const $button = $(event.target);
        $button.removeClass('disableExclusionButton').addClass('disabledExclusionButton');
        $button.removeClass('fa-toggle-on').addClass('fa-toggle-off');
        $button.attr('title', 'Disabled');
        $('input', this.$el).attr('disabled');
        $('select', this.$el).attr('disabled');
        $('textarea', this.$el).attr('disabled');
        this.model.set('enabled', false);
    },
    enable: function (event) {
        const $button = $(event.target);
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

const AllExclusionsView = Backbone.View.extend({
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
        const $exclusionButton = $('#exclusionButton');
        const numActiveElements = this.collection.filter((filterModel) => !!filterModel.get('enabled')).length;
        $('.badge', $exclusionButton).text(numActiveElements > 0 ? numActiveElements : '');
        return this;
    },
    addExclusion: function (exclusion) {
        const view = new ExclusionView({
            model: exclusion,
            collection: this.collection,
            control: this.control
        });
        const childElement = view.render().el;
        // const dataframeAttribute = exclusion.get('attribute');
        this.exclusionsContainer.append(childElement);
        exclusion.set('$el', $(childElement));
    },
    removeExclusion: function (exclusion) {
        const $el = exclusion.get('$el');
        if ($el) {
            $el.remove();
        }
    },
    addExclusionFromButton: function (/*evt*/) {
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
Handlebars.registerHelper('json', (context) => JSON.stringify(context));


function ExclusionsPanel (socket, control, labelRequests) {
    //const $button = $('#exclusionButton');

    if (control === undefined) {
        control = new FilterControl(socket);
    }
    this.control = control;

    this.labelRequestSubscription = labelRequests.filter(
        (labelRequest) => labelRequest.excludeQuery !== undefined
    ).do((labelRequest) => {
        const exclusion = labelRequest.excludeQuery;
        this.collection.addExclusion(exclusion);
    }).subscribe(_.identity, util.makeErrorHandler('Handling an exclusion from a label'));

    // Initial exclusions list, after which adds should pop open the panel:
    this.control.exclusionsResponsesSubject.take(1).do((exclusions) => {
        _.each(exclusions, (exclusion) => {
            this.collection.add(new ExclusionModel(exclusion));
        });
        this.collection.on('add', () => {
            this.toggleVisibility(true);
        });
    }).subscribe(_.identity, util.makeErrorHandler('Reading exclusions from workbook'));
    this.collection = new ExclusionCollection([], {
        control: this.control
    });

    this.model = ExclusionModel;

    /** Exposes changes to the ExclusionCollection. */
    this.exclusionsSubject = new Rx.ReplaySubject(1);
    // Seed with a fresh exclusions list. Should come from persisted state.
    this.collection.on('change reset add remove', (/*model, options*/) => {
        this.exclusionsSubject.onNext(this.collection);
    });

    this.exclusionsSubject.subscribe(
        (collection) => {
            this.control.updateExclusions(collection.map((model) => _.omit(model.toJSON(), '$el')));
        },
        util.makeErrorHandler('updateExclusions on exclusions change event')
    );

    this.view = new AllExclusionsView({
        collection: this.collection,
        control: this.control,
        el: $('#exclusionsPanel')
    });
}

ExclusionsPanel.prototype.isVisible = function () { return this.view.$el.is(':visible'); };

ExclusionsPanel.prototype.toggleVisibility = function (newVisibility) {
    const $panel = this.view.el;
    $panel.toggle(newVisibility);
    $panel.css('visibility', newVisibility ? 'visible': 'hidden');
};

ExclusionsPanel.prototype.setupToggleControl = function (toolbarClicks, $panelButton, $resetElements) {
    const panelToggles = toolbarClicks.filter(
        (elt) => elt === $panelButton[0] || $resetElements.find(elt)
    ).map((elt) => {
        // return the target state (boolean negate)
        if (elt === $panelButton[0]) {
            return !this.isVisible();
        } else if ($resetElements.find(elt)) {
            return false;
        } else {
            return false;
        }
    });
    this.togglesSubscription = panelToggles.do((newVisibility) => {
        $panelButton.children('i').toggleClass('toggle-on', newVisibility);
        this.toggleVisibility(newVisibility);
    }).subscribe(_.identity, util.makeErrorHandler('Turning on/off the exclusion panel'));
};

ExclusionsPanel.prototype.dispose = function () {
    this.exclusionsSubject.dispose();
    this.togglesSubscription.dispose();
    this.labelRequestSubscription.dispose();
};


module.exports = ExclusionsPanel;
