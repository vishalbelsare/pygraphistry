'use strict';

var _ = require('underscore');
var Backbone = require('backbone');

var QuerySelectionModel = Backbone.Model.extend({
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
                    type: 'BinaryPredicate',
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

module.exports = QuerySelectionModel;
