import {
    ref as $ref,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';

import { Observable } from 'rxjs';
import {
    ADD_EXPRESSION,
    REMOVE_EXPRESSION,
    UPDATE_EXPRESSION,
    SET_EXPRESSION_ENABLED
} from 'viz-shared/actions/expressions';

export default function expressions(action$, store) {
    return Observable.merge(
        addExpression(action$.ofType(ADD_EXPRESSION), store)
    ).ignoreElements();
}

function addExpression(action$) {
    return action$.exhaustMap(
        ({ name, dataType, attribute, falcor }) => {
            return falcor.call('add', [name, dataType, attribute]);
        });
}
