'use strict';

var $       = window.$;
var _       = require('underscore');
var Rx      = require('rx');
              require('../rx-jquery-stub');
var Handlebars = require('handlebars');
var Backbone = require('backbone');
    Backbone.$ = $;
//var Ace     = require('brace');
var FilterControl = require('./filter.js');
var ExpressionEditor = require('./expressionEditor.js');
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
        var query = this.get('query') || this.placeholderQuery();
        return control.queryToExpression(query);
    },
    updateExpression: function (control, newExpression) {
        var query = control.queryFromExpressionString(newExpression);
        if (query.error) {
            throw query.error;
        }
        if (query === undefined) {
            // Clear the query? No-op for now.
            return;
        }
        if (!query.attribute) {
            query.attribute = this.get('attribute');
        }
        if (!_.isEqual(query, this.get('query'))) {
            this.set('query', query);
        }
    }
});

var FilterCollection = Backbone.Collection.extend({
    model: FilterModel,
    control: undefined,
    namespaceMetadata: undefined,
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
 * @type {Array.<{name: String, value: String}>}
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
 * @type {Array.<{name: String, value: String}>}
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
        'click .disabledFilterButton': 'enable',
        'click .expandFilterButton': 'expand',
        'click .expendedFilterButton': 'shrink',
        'click .deleteFilterButton': 'delete',
        'change textarea.filterExpression': 'updateQuery'
    },

    initialize: function (options) {
        this.control = options.control;
        this.listenTo(this.model, 'destroy', this.remove);
        this.template = Handlebars.compile($('#filterTemplate').html());
    },
    render: function () {
        var bindings = {
            model: _.extend({
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

        this.$expressionArea = this.$('.filterExpression');

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
            this.$expressionArea.attr('title', 'Filter expression');
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
        $button.removeClass('disableFilterButton').addClass('disabledFilterButton');
        $button.removeClass('fa-toggle-on').addClass('fa-toggle-off');
        $button.attr('title', 'Disabled');
        $('input', this.$el).attr('disabled');
        $('select', this.$el).attr('disabled');
        $('textarea', this.$el).attr('disabled');
        this.model.set('enabled', false);
    },
    enable: function (event) {
        var $button = $(event.target);
        $button.removeClass('disabledFilterButton').addClass('disableFilterButton');
        $button.removeClass('fa-toggle-off').addClass('fa-toggle-on');
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
    initialize: function (options) {
        this.control = options.control;
        this.listenTo(this.collection, 'add', this.addFilter);
        this.listenTo(this.collection, 'remove', this.removeFilter);
        this.listenTo(this.collection, 'reset', this.refresh);
        this.listenTo(this.collection, 'all', this.render);

        this.el = options.el;
        this.filtersContainer = $('#filters');

        this.collection.each(this.addFilter, this);
    },
    render: function () {
        var $filterButton = $('#filterButton');
        $filterButton.attr('data-count', this.collection.length);
        $filterButton.toggleClass('iconBadge', !this.collection.isEmpty());
        return this;
    },
    addFilter: function (filter) {
        var view = new FilterView({
            model: filter,
            collection: this.collection,
            control: this.control
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
        var $target = $(evt.currentTarget);
        var attributes = {};
        // Preferred route, just get the data:
        if ($target.data('attributes') !== undefined) {
            attributes = _.clone($target.data('attributes'));
            // TODO: Schema fix-up, need to re-examine:
            attributes.attribute = attributes.name;
        } else {
            // Fallback: parse!
            var attribute = $target.text().trim();
            var parts = attribute.match(/^(?:([-A-z_]+):)?([^()]+)(?:[ ]+\(.+\))?$/);
            attributes.attribute = attribute;
            attributes.type = parts[1] || 'point';
            attributes.attribute = attributes.type + ':' + parts[2];
            if (parts.length > 3) {
                attributes.dataType = parts[3];
            }
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

// Used to attach attributes to Add Filter dropdown:
Handlebars.registerHelper('json', function(context) {
    return JSON.stringify(context);
});


function FiltersPanel(socket/*, urlParams*/) {
    //var $button = $('#filterButton');

    this.control = new FilterControl(socket);

    this.collection = new FilterCollection([], {
        control: this.control
    });

    this.model = FilterModel;

    /** Exposes changes to the FilterCollection. */
    this.filtersSubject = new Rx.ReplaySubject(1);
    // Seed with a fresh filters list. Should come from persisted state.
    this.collection.on('change reset add remove', function (/*model, options*/) {
        this.filtersSubject.onNext(this.collection);
    }.bind(this));

    this.collection.addFilter({
        title: 'Point Limit',
        attribute: undefined,
        query: {
            type: 'point',
            ast: {
                type: 'Limit',
                value: {
                    type: 'Literal',
                    dataType: 'integer',
                    value: 8e5
                }
            },
            inputString: 'LIMIT 800000'
        }
    });

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

    this.view = new AllFiltersView({
        collection: this.collection,
        control: this.control,
        el: $('#filtersPanel')
    });
}

FiltersPanel.prototype.dispose = function () {
    this.filtersSubject.dispose();
};


module.exports = FiltersPanel;
