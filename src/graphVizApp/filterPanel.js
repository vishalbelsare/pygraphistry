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

/**
 * @param {Object} namespaceMetadata
 * @constructor
 */
function DataframeCompleter(namespaceMetadata) {
    this.setNamespaceMetadata(namespaceMetadata);
    this.caseSensitive = false;
}

//DataframeCompleter.prototype.insertMatch = function (editor, data) {
//
//};

DataframeCompleter.prototype.setNamespaceMetadata = function (namespaceMetadata) {
    this.namespaceMetadata = namespaceMetadata;
    var newNamespaceAttributes = {};
    _.each(namespaceMetadata, function (columnsByName, type) {
        _.each(columnsByName, function (column, attributeName) {
            newNamespaceAttributes[type + ':' + attributeName] = column;
            if (newNamespaceAttributes[attributeName] === undefined) {
                newNamespaceAttributes[attributeName] = column;
            }
        });
    });
    /** @type {Array.<String>} */
    this.namespaceAttributes = _.keys(newNamespaceAttributes);
};

/**
 * Ace autocompletion framework API
 * @param {Ace.Editor} editor
 * @param {Ace.EditSession} session
 * @param {Number} pos
 * @param {String} prefix
 * @param {Function} callback
 */
DataframeCompleter.prototype.getCompletions = function (editor, session, pos, prefix, callback) {
    if (prefix.length === 0 || !this.namespaceAttributes) {
        callback(null, []);
        return;
    }
    if (!this.caseSensitive) {
        prefix = prefix.toLowerCase();
    }
    var scoredAttributes = _.map(this.namespaceAttributes, function (value) {
        var matchValue = this.caseSensitive ? value : value.toLowerCase();
        var lastIdx = matchValue.lastIndexOf(prefix, 0);
        if (lastIdx === 0) {
            return [value, 1];
        } else if (lastIdx === value.lastIndexOf(':', 0) + 1) {
            return [value, 0.8];
        }
        return [value, 0];
    }, this).filter(function (scoreAndValue) {
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

        var $expressionArea = this.$('.filterExpression');

        this.editor = ace.edit($expressionArea[0]);
        this.editor.setTheme('ace/theme/chrome');
        this.editor.setOptions({
            minLines: 2,
            maxLines: 4,
            wrap: true,
            enableBasicAutocompletion: true,
            enableSnippets: true,
            enableLiveAutocompletion: true
        });
        this.editor.setHighlightSelectedWord(true);
        this.editor.setHighlightActiveLine(true);
        this.editor.renderer.setShowGutter(true);
        this.editor.setWrapBehavioursEnabled(true);
        this.editor.setBehavioursEnabled(true);
        // Silences a deprecation warning we don't care about:
        this.editor.$blockScrolling = Infinity;
        var dataframeCompleter = new DataframeCompleter([]);
        this.editor.completers.push(dataframeCompleter);
        this.control.namespaceMetadataObservable().filter(function (namespaceMetadata) {
            return namespaceMetadata !== undefined;
        }).subscribe(function (namespaceMetadata) {
            dataframeCompleter.setNamespaceMetadata(namespaceMetadata);
        }.bind(this));
        var session = this.editor.getSession();
        session.setUseSoftTabs(true);
        session.setMode('ace/mode/graphistry');
        var expression = this.model.getExpression(this.control);
        if (expression) {
            session.setValue(expression);
        }
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
                type: 'warning'
            };
            if (syntaxError) {
                annotation = {
                    row: syntaxError.line && syntaxError.line - 1,
                    column: syntaxError.offset,
                    text: syntaxError.message,
                    type: 'error'
                };
            }
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

        this.filtersContainer = $('#filters');
    },
    render: function () {
        var $filterButton = $('filterButton');
        $filterButton.attr('data-count', this.collection.length);
        if (this.collection.isEmpty()) {
            $filterButton.removeClass('iconBadge');
        } else {
            $filterButton.addClass('iconBadge');
        }
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
        var attribute = $(evt.currentTarget).text().trim();
        var parts = attribute.match(/^(?:([-A-z_]+):)?([-A-z_]+)(?:[ ]+\(([A-z]+)\))?$/);
        var attributes = {attribute: attribute};
        attributes.type = parts[1] || 'point';
        attributes.attribute = parts[2];
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
            ast: {limit: {point: 8e5}},
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
