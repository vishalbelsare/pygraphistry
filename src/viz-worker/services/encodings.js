import { Observable } from 'rxjs';

import encodings from 'viz-worker/simulator/encodings';
import palettes from 'viz-worker/simulator/palettes';
import dataTypeUtil from 'viz-worker/simulator/dataTypes';

import {
    encoding as createEncoding
} from 'viz-shared/models/expressions';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value,
    pathInvalidation as $invalidate
} from '@graphistry/falcor-json-graph';


// TODO PAUL:
export function setEncoding (loadViewsById) {
    return function setEncoding ({workbookIds, viewIds, id, graphType, attribute, variation, binning, timeBounds, reset}) {
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
    return function resetEncoding ({ workbookIds, viewIds, id}) {
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



// TODO PAUL: These two functions do the work of making sure encodings are properly stored
// in the simulator and propagated to the VBOs. They take in the view and the encoding model.

function resetEncodingOnNBody ({ view, encoding }) {
    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !encoding) {
        return Observable.of(encoding);
    }

    let {id, encodingType, graphType: unnormalizedType, attribute: unnormalizedAttribute} = encoding;
    const ccManager = dataframe.computedColumnManager;
    const encodingMetadata = getEncodingMetadata(dataframe, encodingType, unnormalizedType, unnormalizedAttribute);
    let {bufferName} = encodingMetadata;

    if (ccManager.resetLocalBuffer(bufferName, dataframe)) {
        // TODO PAUL: Force VBO Update
        // this.tickGraph(cb);
    }

    return Observable.of(encoding);
}

function applyEncodingOnNBody ({ view, encoding }) {
    const { nBody: { dataframe, simulator } = {}} = view;

    if (!dataframe || !simulator || !encoding) {
        return Observable.of(encoding);
    }

    let {id, encodingType, graphType: unnormalizedType, attribute: unnormalizedAttribute, variation, binning, timeBounds, reset} = encoding;
    const ccManager = dataframe.computedColumnManager;
    const encodingMetadata = getEncodingMetadata(dataframe, encodingType, unnormalizedType, unnormalizedAttribute);
    let {normalization, bufferName} = encodingMetadata;
    const {attribute: attributeName, type} = normalization;
    encodingType = encodingMetadata.encodingType || encodingType;
    let encodingWrapper;

    // TODO FIXME: Have a more robust encoding spec, instead of multiple paths through here
    if (timeBounds) {
        encodingWrapper = encodings.inferTimeBoundEncoding(
            dataframe, type, attributeName, encodingType, timeBounds);
    } else {
        encodingWrapper = encodings.inferEncoding(
            dataframe, type, attributeName, encodingType, variation, binning);
    }

    if (encodingWrapper === undefined || encodingWrapper.scaling === undefined) {
        // TODO: Fail Better
        return Observable.of(encoding);
        // failWithMessage(cb, 'No scaling inferred for: ' + encodingType + ' on ' + attributeName);
    }

    let wrappedScaling = encodingWrapper.scaling;
    if (encodingType.match(/Color$/)) {
        // Auto-detect when a buffer is filled with our ETL-defined color space and map that directly:
        // TODO don't have ETL magically encode the color space; it doesn't save space, time, code, or style.
        if (dataframe.doesColumnRepresentColorPaletteMap(type, attributeName)) {
            wrappedScaling = (x) => palettes.bindings[x];
            encodingWrapper.legend = _.map(encodingWrapper.legend,
                (sourceValue) => palettes.intToHex(palettes.bindings[sourceValue]));
        } else {
            wrappedScaling = (x) => palettes.hexToABGR(encodingWrapper.scaling(x));
        }
    }

    encoding.legend = encodingWrapper.legend;



    // Now that we have an encoding function, store it as a computed column;
    const oldDesc = ccManager.getComputedColumnSpec('localBuffer', bufferName);
    if (oldDesc === undefined) {
        // TODO: Fail better
        return Observable.of(encoding);
    }

    // If this is the first encoding for a buffer type, store the original
    // spec so we can recover it.
    if (!ccManager.overlayBufferSpecs[bufferName]) {
        ccManager.overlayBufferSpecs[bufferName] = oldDesc;
    }

    const desc = oldDesc.clone();
    desc.setDependencies([[attributeName, type]]);
    if (bufferName === 'edgeColors') {
        desc.setComputeAllValues((values, outArr, numGraphElements) => {
            for (let i = 0; i < numGraphElements; i++) {
                const val = values[i];
                if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                    const scaledValue = wrappedScaling(val);
                    outArr[i*2] = scaledValue;
                    outArr[i*2 + 1] = scaledValue;
                }
            }
            return outArr;
        });
    } else {
        desc.setComputeAllValues((values, outArr, numGraphElements) => {
            for (let i = 0; i < numGraphElements; i++) {
                const val = values[i];
                if (!dataTypeUtil.valueSignifiesUndefined(val)) {
                    outArr[i] = wrappedScaling(val);
                }
            }
            return outArr;
        });
    }

    ccManager.addComputedColumn(dataframe, 'localBuffer', bufferName, desc);

    // TODO PAUL: Signal update to VBOs
    return Observable.of(encoding);

}

function getEncodingMetadata (dataframe, encodingType, unnormalizedType, unnormalizedAttribute) {

    const normalization = dataframe.normalizeAttributeName(unnormalizedAttribute, unnormalizedType);

    if (normalization === undefined) {
        // TODO: Pass along error
        return {};
    }

    const {attribute: attributeName, type} = normalization;

    if (encodingType) {
        if (encodingType === 'color' || encodingType === 'size' || encodingType === 'opacity') {
            encodingType = type + encodingType.charAt(0).toLocaleUpperCase() + encodingType.slice(1);
        }
        if (encodingType.indexOf(type) !== 0) {
            // TODO: Pass along error
            return {};
        }
    }

    let bufferName;

    if (!encodingType) {
        encodingType = encodings.inferEncodingType(dataframe, type, attributeName);
    }
    bufferName = encodings.bufferNameForEncodingType(encodingType);

    return {bufferName, encodingType, normalization};
}


