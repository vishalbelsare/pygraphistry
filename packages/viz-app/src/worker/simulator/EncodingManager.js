//TODO workbook loading should fill this out (dataframe.encodingManager)


import { Observable } from 'rxjs';
const _       = require('underscore');

//TODO make these cleaner
export {resetEncodingOnNBody, applyEncodingOnNBody} from './encodings.js';
import {resetEncodingOnNBody, applyEncodingOnNBody} from './encodings.js';
import { multiplexedPalettes } from './palettes2.js';


//Encoding manager works at two levels:
// 1. Takes & gives declarative encoding state
// 2. Passes down to ColumnManager as needed
// The result is ColumnManager focuses more on buffers & perf,
//    while EncodingManager on interface & defaults
export default class EncodingManager {

    constructor () {

        //lazily filled out by set
        this.tables = {
            point: {},
            edge: {},
            time: {},
            current: {
                point: {
                    color: null,
                    opacity: null,
                    size: null,
                    weight: null,
                    icon: null
                },
                edge: {
                    color: null,
                    opacity: null,
                    size: null,
                    weight: null,
                    icon: null
                }
            }
        };

    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType, attribute, variant, ?reset, ...}}
    // -> Observable {encoding, encodingSpec} or null
    //  (do not need current encoding if clearing, just graphType & encodingType)
    setEncoding ({ view, encoding }) {

        const { graphType, encodingType, reset = false } = encoding;
        const encodingWrapped = wrapEncodingType({ ...encoding, reset });

        const applyOrResetEncoding = reset ?
            resetEncodingOnNBody({ view, encoding: encodingWrapped }) :
            applyEncodingOnNBody({ view, encoding: encodingWrapped }) ;

        return applyOrResetEncoding.do(({ dirty, ...encodingSpec }) => {

            const { nBody } = view;
            const { interactions } = nBody;
            const { tables: { current }} = this;

            current[graphType][encodingType] = reset ? null : { encoding, encodingSpec };

            if (dirty && interactions) {
                interactions.next({ play: true, layout: false });
            }
        });
    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> {encoding, encodingSpec} or null
    getEncoding ({view, encoding: {graphType, encodingType}}) {
        return this.tables.current[graphType][encodingType];
    }

    //TODO unify with simulator/encodings:inferColorScalingSpecFor() etc.
    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> partial encodingSpec
    getEncodingOptions({view, encoding: {graphType, encodingType}}) {
        return {
            point:  { color: multiplexedPalettes },
            edge:   { color: multiplexedPalettes }
        }[graphType][encodingType];

    }
}


//simulator/encodings.js expects 'pointColor' instead of 'color'
function wrapEncodingType(encoding) {
    const { graphType, encodingType } = encoding;
    return _.extend({},
        encoding,
        {encodingType: `${graphType}${encodingType[0].toUpperCase()}${encodingType.slice(1)}`});
}

//simulator/encodings.js returns 'pointColor' instead of 'color'
function unwrapEncodingType(encoding) {
    const { graphType, encodingType } = encoding;
    return _.extend({},
        encoding,
        {encodingType: encodingType.slice(graphType.length).toLowerCase()});
}
