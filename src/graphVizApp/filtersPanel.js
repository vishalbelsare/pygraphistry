'use strict';

const $       = window.$;
const _       = require('underscore');
const Rx      = require('rxjs/Rx.KitchenSink');
import '../rx-jquery-stub';
const Handlebars = require('handlebars');
const Backbone = require('backbone');
Backbone.$ = $;
const FilterControl       = require('./FilterControl.js');
const QuerySelectionModel = require('./QuerySelectionModel.js');
const ExpressionEditor    = require('./expressionEditor.js');
const ExpressionPrinter   = require('./expressionPrinter.js');
const Identifier          = require('./Identifier.js');
const util          = require('./util.js');


const COLLAPSED_FILTER_HEIGHT = 80;

/**
 * @type {string[]}
 */
const GraphComponentTypes = ['point', 'edge'];

const FilterModel = QuerySelectionModel.extend({
    isSystem: function () {
        return this.get('level') === 'system';
    }
});

const FilterCollection = Backbone.Collection.extend({
    model: FilterModel,
    control: undefined,
    namespaceMetadata: undefined,
    addFilter: function(attributes) {
        if (!attributes.title) {
            attributes.title = attributes.attribute;
        }
        const newFilter = new FilterModel(attributes);
        this.push(newFilter);
    }
});

/**
 * This is not the underlying data type but the logical type for the query.
 * @type {Array.<{name: String, value: String}>}
 */
const DataTypes = [
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
const FilterControlTypes = [
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

const FilterView = Backbone.View.extend({
    tagName: 'div',
    className: 'filterInspector container-fluid',
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
        const bindings = {
            model: _.extend({
                placeholder: ExpressionPrinter.print(this.model.placeholderQuery()),
                isSystem: this.model.isSystem() || undefined
            }, this.model.toJSON()),
            dataTypes: _.map(DataTypes, (dataType) => {
                if (dataType.value === this.model.get('dataType')) {
                    return _.extend({selected: true}, dataType);
                }
                return dataType;
            }),
            controlTypes: _.map(FilterControlTypes, (controlType) => {
                if (controlType.value === this.model.get('controlType')) {
                    return _.extend({selected: true}, controlType);
                }
                return controlType;
            })
        };
        const html = this.template(bindings);
        this.$el.html(html);

        this.initEditor();
        $('[data-toggle="tooltip"]', this.$el).tooltip();
        return this;
    },
    initEditor: function () {
        if (this.editor !== undefined) { return; }

        this.$expressionArea = this.$('.filterExpression');

        this.editor = new ExpressionEditor(this.$expressionArea[0]);
        const readOnly = this.model.get('controlType') !== undefined;
        this.editor.setReadOnly(readOnly);
        this.$expressionArea.toggleClass('disabled', readOnly);
        this.$el.toggleClass('disabled', readOnly);
        if (readOnly) {
            this.listenTo(this.model, 'change', () => {
                const inputString = this.model.get('query').inputString;
                if (inputString !== undefined) {
                    this.editor.session.setValue(inputString);
                }
            });
        }
        this.control.namespaceMetadataObservable().filter(
            (namespaceMetadata) => namespaceMetadata !== undefined
        ).subscribe((namespaceMetadata) => {
            this.editor.dataframeCompleter.setNamespaceMetadata(namespaceMetadata);
        });
        const expression = this.model.getExpression();
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
        const $button = $(event.target);
        $button.removeClass('disableFilterButton').addClass('disabledFilterButton');
        $button.removeClass('fa-toggle-on').addClass('fa-toggle-off');
        $button.attr('title', 'Disabled');
        $('input', this.$el).attr('disabled');
        $('select', this.$el).attr('disabled');
        $('textarea', this.$el).attr('disabled');
        this.model.set('enabled', false);
    },
    enable: function (event) {
        const $button = $(event.target);
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

const AllFiltersView = Backbone.View.extend({
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
        const $filterButton = $('#filterButton');
        const numActiveElements = this.collection.filter((filterModel) => !!filterModel.get('enabled')).length;
        $('.badge', $filterButton).text(numActiveElements > 0 ? numActiveElements : '');
        $('[data-toggle="tooltip"]', this.$el).tooltip();
        return this;
    },
    addFilter: function (filter) {
        const view = new FilterView({
            model: filter,
            collection: this.collection,
            control: this.control
        });
        const childElement = view.render().el;
        // const dataframeAttribute = filter.get('attribute');
        this.filtersContainer.append(childElement);
        filter.set('$el', $(childElement));
    },
    removeFilter: function (filter) {
        const $el = filter.get('$el');
        if ($el) {
            $el.remove();
        }
    },
    addFilterFromDropdown: function (evt) {
        const $target = $(evt.currentTarget);
        let attributes = {};
        // Preferred route, just get the data:
        if ($target.data('attributes') !== undefined) {
            attributes = _.clone($target.data('attributes'));
            // TODO: Schema fix-up, need to re-examine:
            attributes.attribute = attributes.name;
        } else {
            // Fallback: parse!
            const attribute = $target.text().trim();
            const parts = attribute.match(/^(?:([-A-z_]+):)?([^()]+)(?:[ ]+\(.+\))?$/);
            attributes.attribute = attribute;
            attributes.type = parts[1] || 'point';
            attributes.attribute = Identifier.clarifyWithPrefixSegment(parts[2], attributes.type);
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
Handlebars.registerHelper('json', (context) => JSON.stringify(context));


function FiltersPanel(socket, labelRequests, settingsChanges) {
    //const $button = $('#filterButton');

    this.control = new FilterControl(socket);

    this.labelRequestSubscription = labelRequests.filter(
        (labelRequest) => labelRequest.filterQuery !== undefined
    ).do((labelRequest) => {
        this.collection.addFilter(labelRequest.filterQuery);
    }).subscribe(_.identity, util.makeErrorHandler('Handling a filter from a label'));

    this.pruneOrphansSubscription = settingsChanges.filter((nameAndValue) => nameAndValue.name === 'pruneOrphans')
        .map((nameAndValue) => nameAndValue.value).distinctUntilChanged()
        .do((/*pruneOrphansEnabled*/) => this.runFilters())
        .subscribe(_.identity, util.makeErrorHandler('Handle prune orphans settings change'));

    this.control.filtersResponsesSubject.take(1).do((filters) => {
        _.each(filters, (filter) => {
            this.collection.add(new FilterModel(filter));
        });
    }).subscribe(_.identity, util.makeErrorHandler('Reading filters from workbook'));
    this.collection = new FilterCollection([], {
        control: this.control
    });

    this.model = FilterModel;

    /** Exposes changes to the FilterCollection. */
    this.filtersSubject = new Rx.ReplaySubject(1);
    // Seed with a fresh filters list. Should come from persisted state.
    this.collection.on('change reset add remove', (/*model, options*/) => {
        this.filtersSubject.onNext(this.collection);
    });

    this.filtersSubject.subscribe(
        (collection) => { this.runFilters(collection); },
        util.makeErrorHandler('updateFilters on filters change event'));

    const namespaceMetadataObservable = this.control.namespaceMetadataObservable();
    this.combinedSubscription = namespaceMetadataObservable.combineLatest(
        this.filtersSubject,
        (dfa, fs) => ({dataframeAttributes: dfa, filterSet: fs})
    ).do((data) => {
        // Setup add filter button.
        const addFilterTemplate = Handlebars.compile($('#addFilterTemplate').html());
        // Flatten the keys used to access the column with the 'name' property stored on the column.
        const namespaceByType = {point: {}, edge: {}};
        _.each(data.dataframeAttributes, (columnsByName, type) => {
            const typeNamespace = namespaceByType[type];
            _.each(columnsByName, (column, attributeName) => {
                // PATCH rename "type" to "dataType" to avoid collisions:
                if (column.hasOwnProperty('type') && !column.hasOwnProperty('dataType')) {
                    column.dataType = column.type;
                    delete column.type;
                }
                _.defaults(column, {type: type});
                typeNamespace[attributeName] = column;
                if (column.name !== attributeName && typeNamespace[column.name] === undefined) {
                    typeNamespace[column.name] = column;
                }
            });
        });
        // TODO flatten the namespace into selectable elements:
        const bindingsByName = {};
        // Depends on point columns handled before edge columns:
        _.each(GraphComponentTypes, (type) => {
            _.each(namespaceByType[type], (column, attributeName) => {
                const prefixedName = Identifier.clarifyWithPrefixSegment(attributeName, type);
                if (type === GraphComponentTypes[0]) {
                    const otherType = GraphComponentTypes[1];
                    if (namespaceByType[otherType].hasOwnProperty(attributeName)) {
                        bindingsByName[prefixedName] = column;
                        const otherColumn = namespaceByType[otherType][attributeName],
                            otherName = Identifier.clarifyWithPrefixSegment(attributeName, otherType);
                        bindingsByName[otherName] = otherColumn;
                    } else if (!bindingsByName.hasOwnProperty(attributeName)) {
                        bindingsByName[prefixedName] = column;
                    }
                } else if (!bindingsByName.hasOwnProperty(attributeName)) {
                    bindingsByName[prefixedName] = column;
                }
            });
        });
        const bindingsList = [];
        _.each(bindingsByName, (binding, name) => {
            bindingsList.push(_.defaults({name: name}, binding));
        });
        const params = {fields: bindingsList};
        const html = addFilterTemplate(params);
        $('#addFilter').addClass('container-fluid').html(html);
    }).subscribe(_.identity, (err) => {
        console.log('Error updating Add Filter', err);
    });

    this.view = new AllFiltersView({
        collection: this.collection,
        control: this.control,
        el: $('#filtersPanel')
    });
}

FiltersPanel.prototype.runFilters = function (collection) {
    if (collection === undefined) {
        collection = this.collection;
    }
    return this.control.updateFilters(collection.map((model) => _.omit(model.toJSON(), '$el')));
};

FiltersPanel.prototype.isVisible = function () { return this.view.$el.is(':visible'); };

FiltersPanel.prototype.toggleVisibility = function (newVisibility) {
    const $panel = this.view.el;
    $panel.toggle(newVisibility);
    $panel.css('visibility', newVisibility ? 'visible': 'hidden');
};

FiltersPanel.prototype.setupToggleControl = function (toolbarClicks, $panelButton, $resetElements) {
    const panelToggles = toolbarClicks.filter((elt) => elt === $panelButton[0] || $resetElements.find(elt)
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
    }).subscribe(_.identity, util.makeErrorHandler('Turning on/off the filter panel'));
};

FiltersPanel.prototype.dispose = function () {
    this.filtersSubject.dispose();
    this.togglesSubscription.dispose();
    this.labelRequestSubscription.dispose();
    this.pruneOrphansSubscription.dispose();
};


module.exports = FiltersPanel;
