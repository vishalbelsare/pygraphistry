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

    constructor (columnManager) {

        this.columnManager = columnManager;

        this.tables = {
            point: {},
            edge: {},
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
                }
            }
        };

    }

    loadDefaults () {

        const { columnManager } = this;

        // copy in defaults. Copy so we can recover defaults when encodings change
        _.each(defaultColumns, (cols, colType) =>
            _.each(cols, (colDesc, name) =>
                columnManager.loadComputedColumnSpecInternally(colType, name, colDesc)));

        _.each(defaultEncodingColumns, (cols, colType) =>
            _.each(cols, (colDesc, name) =>
                columnManager.loadComputedColumnSpecInternally(colType, name, colDesc)));

    }

}