//TODO workbook loading should fill this out (dataframe.encodingManager)

import { Observable } from 'rxjs';

//TODO make these cleaner
export { resetEncodingOnNBody, applyEncodingOnNBody } from './encodings.js';
import { resetEncodingOnNBody, applyEncodingOnNBody } from './encodings.js';
import { multiplexedPalettes } from './palettes2.js';

import { getHistogramForAttribute } from '../services/histograms.js';

function encodingWithoutBinValues(encoding) {
    if (!encoding) return encoding || null;
    const { binning: { valueToBin, ...restBinning } = {}, ...restEncoding } = encoding;
    return { binning: restBinning, ...restEncoding };
}

/*
Sample icon encoding:
{                    
    encodingType: 'icon', 
    graphType: 'point', 
    attribute: 'degree',
    mapping: {
        categorical: {
            fixed: {
                0: 'fighter-jet',
                1: 'github-alt',
                2: 'resistance',
                3: 'black-tie',
                4: 'paperclip'
            },
            other: 'question'
        }
    }
}
*/

//Encoding manager works at two levels:
// 1. Takes & gives declarative encoding state
// 2. Passes down to ColumnManager as needed
// The result is ColumnManager focuses more on buffers & perf,
//    while EncodingManager on interface & defaults
export default class EncodingManager {
    constructor() {
        //lazily filled out by set
        this.tables = {
            point: {},
            edge: {},
            time: {},
            defaults: {
                point: {
                    /* color, opacity, size, weight, icons, axis, ... */
                },
                edge: {
                    /* color, opacity, size, weight, icon, ... */
                }
            },
            current: {
                point: {
                    /* color, opacity, size, weight, icons, axis, ... */
                },
                edge: {
                    /* color, opacity, size, weight, icon, ... */
                }
            }
        };
    }

    //Similar to setEncoding
    //  Set/clear default encoding
    //  If default encoding is on, trigger (re)set
    setDefaultEncoding({ view, encoding }) {
        const { graphType, encodingType, attribute } = encoding;
        const reset = encoding.reset || attribute === undefined;

        const currentEncoding = this.tables.current[graphType][encodingType];
        const isDefaultEncodingActive =
            !Boolean(currentEncoding) || (currentEncoding && currentEncoding.isDefault);

        this.tables.defaults[graphType][encodingType] = reset
            ? null
            : { ...encoding, isDefault: true, reset: false };

        return isDefaultEncodingActive
            ? this.setEncoding({ view, encoding: { ...encoding, reset, isDefault: true } })
            : Observable.of(wrapEncodingType({ ...encoding, reset })); //same as resetEncodingOnNBody
    }

    getDefaultEncoding({ view, encoding }) {
        const { graphType, encodingType } = encoding;
        return this.tables.defaults[graphType][encodingType];
    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType, attribute, variant, ?reset, ?isDefault...}}
    // -> Observable {encoding, encodingSpec} or null
    //  (do not need current encoding if clearing, just graphType & encodingType)

    setEncoding({ view, encoding }) {
        const { graphType, encodingType, attribute } = encoding;
        const reset = encoding.reset || attribute === undefined;

        if (reset && this.tables.defaults[graphType][encodingType]) {
            return this.setEncoding({
                view,
                encoding: this.tables.defaults[graphType][encodingType] //flags isDefault, disables reset
            });
        }

        const maybeBinning = reset
            ? Observable.of({})
            : getHistogramForAttribute({ view, ...encoding });

        return maybeBinning.mergeMap((binning = {}) => {
            const extendedEncoding = { ...encoding, binning };
            const encodingWrapped = wrapEncodingType({ ...extendedEncoding, reset });

            const applyOrResetEncoding = reset
                ? resetEncodingOnNBody({ view, encoding: encodingWrapped })
                : applyEncodingOnNBody({ view, encoding: encodingWrapped });

            return applyOrResetEncoding
                .do(({ dirty, ...encodingSpec }) => {
                    this.tables.current[graphType][encodingType] = reset
                        ? null
                        : { encoding: extendedEncoding, encodingSpec };
                    if (dirty && view.nBody.interactions) {
                        view.nBody.interactions.next({ play: true, layout: false });
                    }
                })
                .map(o => (reset ? o : encodingWithoutBinValues(o)));
        });
    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> {encoding, encodingSpec} or null
    getEncoding({ view, encoding: { graphType, encodingType } }) {
        const out = this.tables.current[graphType][encodingType];
        return !out
            ? null
            : {
                  encoding: encodingWithoutBinValues(out.encoding),
                  encodingSpec: encodingWithoutBinValues(out.encodingSpec)
              };
    }

    //TODO unify with simulator/encodings:inferColorScalingSpecFor() etc.
    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> partial encodingSpec
    getEncodingOptions({ view, encoding: { graphType, encodingType } }) {
        return {
            point: { color: multiplexedPalettes },
            edge: { color: multiplexedPalettes }
        }[graphType][encodingType];
    }
}

//simulator/encodings.js expects 'pointColor' instead of 'color'
function wrapEncodingType(encoding) {
    const { graphType, encodingType } = encoding;
    return {
        ...encoding,
        encodingType: `${graphType}${encodingType[0].toUpperCase()}${encodingType.slice(1)}`
    };
}

//simulator/encodings.js returns 'pointColor' instead of 'color'
function unwrapEncodingType(encoding) {
    const { graphType, encodingType } = encoding;
    return {
        ...encoding,
        encodingType: encodingType.slice(graphType.length).toLowerCase()
    };
}
