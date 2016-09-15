import { Observable } from 'rxjs';
import { maskDataframe } from './maskDataframe';
import {
    filter as createFilter,
    exclusion as createExclusion,
    getDefaultQueryForDataType
} from 'viz-shared/models/expressions';


export function addExpression({ view, name, dataType, attribute, type = 'filter' }) {

    return Observable.defer(() => {

        const { expressionsById } = view;
        const expression = type === 'fitler' ?
            createFilter('', name, dataType, attribute) :
            createExclusion('', name, dataType, attribute);

        expressionsById[expression.id] = expression;

        return maskDataframe({ view }).map(({ view }) => ({
            view, expression
        }));
    });
}
