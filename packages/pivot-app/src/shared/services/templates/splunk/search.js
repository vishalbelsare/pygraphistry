import { SplunkPivot } from './splunkPivot.js';
import stringhash from 'string-hash';
import logger from '../../../logger.js';

const log = logger.createLogger(__filename);


export const searchSplunk = new SplunkPivot({
    id: 'search-splunk-plain',
    name: 'Search Splunk',
    tags: ['Splunk'],
    parameters: [
        {
            name: 'query',
            inputType: 'text',
            label: 'Query:',
            placeholder: 'error',
            defaultValue: 'error',
        },
        {
            name: 'fields',
            inputType: 'multi',
            label: 'Entities:',
            options: [].map(x => ({id:x, name:x})),
            defaultValue: []
        },
        {
            name: 'attributes',
            inputType: 'multi',
            label: 'Attributes:',
            options: [],
        },        
        {
            name: 'time',
            label: 'Time',            
            inputType: 'daterange',
            default: { from: null, to: null }
        }
    ],
    toSplunk: function (args, pivotCache = {}, { time } = {}) {


        this.connections = args.fields.value;
        const query = `search ${args.query} ${this.constructFieldString()} | head 1000`;

        return { 
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time) 
        };
    },
    encodings: {
        point: {
            pointColor: (node) => {
                node.pointColor = stringhash(node.type) % 12;
            }
        }
    }
});
