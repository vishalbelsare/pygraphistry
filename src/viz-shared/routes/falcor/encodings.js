import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

export function encodings(path, base) {
    return function encodings({ loadViewsById, loadEncodingsById }) {

        // TODO PAUL: All of this -- I'm not good at falcor :/

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);


    }
}