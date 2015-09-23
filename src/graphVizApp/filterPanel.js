'use strict';
/* globals ace */

var $       = window.$;
var _       = require('underscore');
var Rx      = require('rx');
              require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl = require('./filter.js');
var util          = require('./util.js');


var COLLAPSED_FILTER_HEIGHT = 80;

var FilterModel = Backbone.Model.extend({
    defaults: {
        title: undefined,
        attribute: undefined,
        dataType: undefined,
        controlType: undefined,
        enabled: true,
        query: undefined
    },
    placeholderQuery: function () {
        var result = {
            attribute: this.get('attribute'),
            dataType: this.get('dataType')
        };
        if (!result.attribute) {
            result.attribute = 'point:degree';
        }
        if (!result.dataType) {
            result.dataType = 'number';
        }
        switch (result.dataType) {
            case 'number':
            case 'float':
            case 'integer':
                result.start = 0;
                result.ast = {
                    type: 'BinaryExpression',
                    operator: '>=',
                    left: {type: 'Identifier', name: result.attribute},
                    right: {type: 'Literal', value: result.start}
                };
                break;
            case 'string':
            case 'categorical':
                result.equals = 'ABC';
                result.ast = {
                    type: 'BinaryExpression',
                    operator: '=',
                    left: {type: 'Identifier', name: result.attribute},
                    right: {type: 'Literal', value: result.equals}
                };
                break;
            case 'boolean':
                result.equals = true;
                result.ast = {
                    type: 'LogicalExpression',
                    operator: 'IS',
                    left: {type: 'Identifier', name: result.attribute},
                    right: {type: 'Literal', value: result.equals}
                };
                break;
            case 'date':
            case 'datetime':
                result.ast = {
                    type: 'BinaryExpression',
                    operator: '>=',
                    left: {type: 'Identifier', name: result.attribute},
                    right: {type: 'Literal', value: 'now'}
                };
                break;
            default:
                result.ast = {
                    type: 'Literal',
                    value: true
                };
        }
        return result;
    },
    getExpression: function (control) {
        return control.queryToExpression(this.get('query'));
    },
    updateExpression: function (control, newExpression) {
        var query = control.queryFromExpressionString(newExpression);
        if (query === undefined) {
            // Clear the query? No-op for now.
            return;
        }
        if (!query.attribute) {
            query.attribute = this.get('attribute');
        }
        this.set('query', query);
    }
});

var FilterCollection = Backbone.Collection.extend({
    model: FilterModel,
    addFilter: function(attributes) {
        if (!attributes.title) {
            attributes.title = attributes.attribute;
        }
        var newFilter = new FilterModel(attributes);
        this.push(newFilter);
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

/**
 * @param {Array} namespaceAttribute
 * @constructor
 */
function DataframeCompleter(namespaceAttribute) {
    this.namespaceAttributes = namespaceAttribute;
}

DataframeCompleter.prototype.getCompletions = function (editor, session, pos, prefix, callback) {
    if (prefix.length === 0 || !this.namespaceAttributes) {
        callback(null, []);
        return;
    }
    var scoredAttributes = this.namespaceAttributes.map(function (value) {
        var lastIdx = value.lastIndexOf(prefix, 0);
        if (lastIdx === 0) {
            return [value, 1];
        } else if (lastIdx === value.lastIndexOf(':', 0) + 1) {
            return [value, 0.8];
        }
        return [value, 0];
    }).filter(function (scoreAndValue) {
        return scoreAndValue[1] > 0;
    });
    callback(null, scoredAttributes.map(function (scoreAndValue) {
        return {
            name: scoreAndValue[0],
            value: scoreAndValue[0],
            score: scoreAndValue[1],
            meta: 'identifier'
        };
    }));
};

var FilterView = Backbone.View.extend({
    tagName: 'div',
    className: 'filterInspector',
    events: {
        'click .disableFilterButton': 'disable',
        'click .disabledFilterButton': 'enable',
        'click .expandFilterButton': 'expand',
        'click .expendedFilterButton': 'shrink',
        'click .deleteFilterButton': 'delete',
        'change textarea.filterExpression': 'updateQuery'
    },

    initialize: function () {
        this.listenTo(this.model, 'destroy', this.remove);
        this.template = Handlebars.compile($('#filterTemplate').html());
        this.control = new FilterControl();
    },
    render: function () {
        var bindings = {
            model: _.extend({
                    expression: this.control.queryToExpression(this.model.get('query')),
                    placeholder: this.control.queryToExpression(this.model.placeholderQuery())
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

        this.initEditor();
        return this;
    },
    initEditor: function () {
        if (this.editor !== undefined) { return; }

        var $expressionArea = this.$('.filterExpression');

        this.editor = ace.edit($expressionArea[0]);
        this.editor.setTheme('ace/theme/chrome');
        this.editor.setOptions({
            minLines: 2,
            maxLines: 4,
            wrap: true,
            enableBasicAutocompletion: false,
            enableSnippets: false,
            enableLiveAutocompletion: true
        });
        this.editor.setHighlightSelectedWord(true);
        this.editor.setHighlightActiveLine(true);
        this.editor.renderer.setShowGutter(true);
        this.editor.setWrapBehavioursEnabled(true);
        this.editor.setBehavioursEnabled(true);
        this.editor.$blockScrolling = Infinity;
        this.editor.completers.push(new DataframeCompleter(this.namespaceMetadata));
        var session = this.editor.getSession();
        session.setUseSoftTabs(true);
        session.setMode('ace/mode/graphistry');
        session.setValue(this.model.getExpression(this.control));
        session.on('change', function (aceEvent) {
            this.updateQuery(aceEvent);
        }.bind(this));
    },
    updateQuery: function (/*aceEvent*/) {
        var expressionString = this.editor.getValue();
        var session = this.editor.getSession();
        session.clearAnnotations();
        try {
            this.model.updateExpression(this.control, expressionString);
        } catch (syntaxError) {
            var annotation = {
                row: syntaxError.line - 1,
                column: syntaxError.offset,
                text: syntaxError.message,
                type: 'error'
            };
            session.setAnnotations([annotation]);
        }
    },
    delete: function (/*event*/) {
        this.$el.remove();
        this.collection.remove(this.model);
    },
    disable: function (event) {
        var $button = $(event.target);
        $button.removeClass('disableFilterButton').addClass('disabledFilterButton');
        $button.removeClass('fa-toggle-off').addClass('fa-toggle-on');
        $button.attr('title', 'Disabled');
        $('input', this.$el).attr('disabled');
        $('select', this.$el).attr('disabled');
        $('textarea', this.$el).attr('disabled');
        this.model.set('enabled', false);
    },
    enable: function (event) {
        var $button = $(event.target);
        $button.removeClass('disabledFilterButton').addClass('disableFilterButton');
        $button.removeClass('fa-toggle-on').addClass('fa-toggle-off');
        $button.attr('title', 'Enabled');
        $('input', this.$el).removeAttr('disabled');
        $('select', this.$el).removeAttr('disabled');
        $('textarea', this.$el).removeAttr('disabled');
        this.model.set('enabled', true);
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
    events: {
        'click .addFilterDropdownField': 'addFilterFromDropdown'
    },
    initialize: function () {
        this.listenTo(this.collection, 'add', this.addFilter);
        this.listenTo(this.collection, 'remove', this.removeFilter);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);

        this.filtersContainer = $('#filters');
    },
    render: function () {
    },
    addFilter: function (filter) {
        var view = new FilterView({
            model: filter,
            panel: this.panel,
            collection: this.collection,
            namespaceMetadata: this.namespaceMetadata
        });
        var childElement = view.render().el;
        // var dataframeAttribute = filter.get('attribute');
        this.filtersContainer.append(childElement);
        filter.set('$el', $(childElement));
    },
    removeFilter: function (filter) {
        var $el = filter.get('$el');
        if ($el) {
            $el.remove();
        }
    },
    addFilterFromDropdown: function (evt) {
        var attribute = $(evt.currentTarget).text().trim();
        var parts = attribute.match(/^(?:([-A-z_]+):)?([-A-z_]+)(?:[ ]+\(([A-z]+)\))?$/);
        var attributes = {attribute: attribute};
        attributes.type = parts[1] || 'point';
        attributes.attribute = parts[1] + ':' + parts[2];
        if (parts.length > 3) {
            attributes.dataType = parts[3];
        }
        this.collection.addFilter(attributes);
    },
    remove: function () {
        this.combinedSubscription.dispose();
    },
    /** Recreates the UI; do not call during interactions. */
    refresh: function () {
        this.filtersContainer.empty();
        this.collection.each(this.addFilter, this);
    }
});


function FiltersPanel(socket, urlParams) {
    var $button = $('#filterButton');

    if (!urlParams.debug) {
        $button.css({display: 'none'});
    }

    this.control = new FilterControl(socket);

    this.collection = new FilterCollection();

    this.model = FilterModel;

    /** Exposes changes to the FilterCollection. */
    this.filtersSubject = new Rx.ReplaySubject(1);
    // Seed with a fresh filters list. Should come from persisted state.
    this.filtersSubject.onNext([]);
    this.collection.on('change reset add remove', function (/*model, options*/) {
        this.filtersSubject.onNext(this.collection);
    }.bind(this));

    this.filtersSubject.subscribe(
        function (collection) {
            this.control.updateFilters(collection.map(function (model) {
                return _.omit(model.toJSON(), '$el');
            }));
        }.bind(this),
        util.makeErrorHandler('updateFilters on filters change event')
    );

    var namespaceMetadataObservable = this.control.namespaceMetadataObservable();
    this.combinedSubscription = namespaceMetadataObservable.combineLatest(
        this.filtersSubject,
        function (dfa, fs) {
            return {dataframeAttributes: dfa, filterSet: fs};
        }).do(function (data) {
            // Setup add filter button.
            var addFilterTemplate = Handlebars.compile($('#addFilterTemplate').html());
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
            var html = addFilterTemplate(params);
            $('#addFilter').html(html);
        }).subscribe(_.identity, function (err) {
            console.log('Error updating Add Filter', err);
        });

    namespaceMetadataObservable.subscribe(function (namespaceMetadata) {
        this.view = new AllFiltersView({
            collection: this.collection,
            panel: this,
            el: $('#filtersPanel'),
            namespaceMetadata: namespaceMetadata
        });
    }.bind(this));
}

FiltersPanel.prototype.dispose = function () {
    this.filtersSubject.dispose();
};


module.exports = FiltersPanel;
