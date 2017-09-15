import logger from '../../../logger.js';
const log = logger.createLogger(__filename);


import { SplunkPivot } from './splunkPivot.js';
import { desiredAttributes, encodings } from './settings.js';


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
            options: desiredAttributes.map(x => ({id:x, name:x})),
            defaultValue: []
        },
        {
            name: 'attributes',
            inputType: 'multi',
            label: 'Attributes:',
            options: desiredAttributes.map(x => ({id:x, name:x}))
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

        const query = `
            search ${args.query} 
            ${this.constructFieldString()}
            ${ (args.query||'').indexOf(' head ') === -1 ? ' | head 1000 ' : ''}`;
 
        return { 
            searchQuery: query,
            searchParams: this.dayRangeToSplunkParams((args.time||{}).value, time) 
        };
    },
    encodings
});
