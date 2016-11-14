import { Observable } from 'rxjs';

import encodings from 'viz-worker/simulator/encodings';
import palettes from 'viz-worker/simulator/palettes';
import dataTypeUtil from 'viz-worker/simulator/dataTypes';

import {
    encoding as createEncoding
} from 'viz-shared/models/encodings';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';


import {
    resetEncodingOnNBody,
    applyEncodingOnNBody,
    getEncodingMetadata
} from '../simulator/EncodingManager.js';


// TODO PAUL:
export function setEncoding (loadViewsById) {
    return function setEncodingById ({workbookIds, viewIds, id, graphType, attribute, variation, binning, timeBounds, reset}) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({workbook, view}) => {
            const { encodingsById } = view;
            const encoding = createEncoding({
                id, graphType, attribute, variation, binning, timeBounds
            });
            encodingsById[id] = encoding;
            return {workbook, view, encoding};
        });
    }
}

export function resetEncoding (loadViewsById) {
    return function resetEncodingById ({ workbookIds, viewIds, id}) {
        return loadViewsById({
            workbookIds, viewIds
        })
        .map(({workbook, view}) => {
            const {encodingsById} = view;
            if (encodingsById.hasOwnProperty(id)) {
                delete encodingsById[id];
            }
            return {workbook, view, id}
        });
    }
}