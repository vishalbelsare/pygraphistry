//TODO workbook loading should fill this out (dataframe.encodingManager)


import { Observable } from 'rxjs';
const _       = require('underscore');

//TODO make these cleaner
export {resetEncodingOnNBody, applyEncodingOnNBody} from './encodings.js';


//Encoding manager works at two levels:
// 1. Initializes underlying ColumnManager for graph and encoding buffers
// 2. Takes & gives declarative encoding state
// 3. Passes down to ColumnManager as needed
// The result is ColumnManager focuses more on buffers & perf,
//    while EncodingManager on interface & defaults
export default class EncodingManager {

    //dataframe will immedately setup some default columns/buffers after as well
    constructor (columnManager) {

        this.columnManager = columnManager;

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
                    weight: null
                },
                edge: {
                    color: null,
                    opacity: null,
                    size: null,
                    weight: null
                },
                timebar: {
                    /*
                    time: null,
                    color: null
                    */
                }
            }
        };

    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType, attribute, variant, ?reset, ...}}
    // -> Observable {encoding, encodingSpec} or null
    //  (do not need current encoding if clearing, just graphType & encodingType)
    setEncoding ({view, encoding}) {
        console.log({cmd: 'setEncoding', encoding});
        const { tables } = this;
        const {graphType, encodingType, reset} = encoding;
        return Observable.of()
            .switchMap(() => {
                if (reset) {
                    const currentEncoding = getEncoding({view, encoding});
                    return resetEncodingOnNBody(
                        {view, encoding: wrapEncodingType({...currentEncoding, reset: true})});
                } else {
                    return applyEncodingOnNBody({view, encoding: wrapEncodingType(encoding)});
                }
            })
            .do((encodingSpec) => //only on success
                tables.current[graphType][encodingType] =
                    reset ? null
                    : {encoding, encodingSpec})
    }

    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> {encoding, encodingSpec} or null
    getEncoding ({view, encoding: {graphType, encodingType}}) {
        console.log({cmd: 'getEncoding', graphType, encodingType});
        return this.tables.current[graphType][encodingType];
    }

    //TODO unify with simulator/encodings:inferColorScalingSpecFor() etc.
    //view: {dataframe, simulator}
    //encoding: {graphType, encodingType}
    // -> partial encodingSpec
    getEncodingOptions({view, encoding: {graphType, encodingType}}) {
        console.log({'msg': 'CHECKING======', graphType, encodingType});
        return {
            point: {
                color: [
                    {variant: 'categorical',
                     legend: [
                        "rgb(166, 206, 227)", "rgb(31, 120, 180)", "rgb(178, 223, 138)", "rgb(51, 160, 44)", "rgb(251, 154, 153)", "rgb(227, 26, 28)", "rgb(253, 191, 111)", "rgb(255, 127, 0)", "rgb(202, 178, 214)", "rgb(106, 61, 154)", "rgb(255, 255, 153)", "rgb(177, 89, 40)"
                    ]},
                    {variant: 'continuous',
                     legend:
                        _.range(0, 10).map((i, idx, all) =>
                            `rgb(${Math.round(i * 255 / all.length)},${Math.round(i * 255 / all.length)},255)`)
                     }
                ]
            },
            edge: {
                color: [
                    {variant: 'categorical',
                     legend: [
                        "rgb(166, 206, 227)", "rgb(31, 120, 180)", "rgb(178, 223, 138)", "rgb(51, 160, 44)", "rgb(251, 154, 153)", "rgb(227, 26, 28)", "rgb(253, 191, 111)", "rgb(255, 127, 0)", "rgb(202, 178, 214)", "rgb(106, 61, 154)", "rgb(255, 255, 153)", "rgb(177, 89, 40)"
                    ]},
                    {variant: 'continuous',
                     legend:
                        _.range(0, 10).map((i, idx, all) =>
                            `rgb(${Math.round(i * 255 / all.length)},${Math.round(i * 255 / all.length)},255)`)
                     }
                ]
            }
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