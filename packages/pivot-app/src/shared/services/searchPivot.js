import { Observable } from 'rxjs';
import { searchSplunk } from './searchSplunk.js';
import { shapeSplunkResults} from './shapeSplunkResults.js';
import PivotTemplates from '../models/PivotTemplates';
import { categoryToColorInt, intToHex } from './support/palette.js';
var _ = require('underscore');

//TODO how to dynamically lookup?
// {int -> [ { ... } ]
var pivotCache = {};

function summarizeOutput ({labels}) {

    //{ typeName -> int }
    const entityTypes = {};
    for (var i = 0; i < labels.length; i++) {
        entityTypes[labels[i].type] = i;
    }

    //{ typeName -> {count, example, name, color} }
    const entitySummaries = _.mapObject(entityTypes, (example, entityType) => {
        return {
            count: 0,
            example: example,
            name: entityType,
            color: intToHex(categoryToColorInt[labels[example].pointColor])};
    });

    //{ typeName -> {?valName} }
    const valLookups = _.mapObject(entityTypes, () => { return {}; });

    for (var i = 0; i < labels.length; i++) {
        const summary = entitySummaries[labels[i].type];
        const lookup = valLookups[labels[i].type];
        const key = labels[i].node;
        if (!_.has(lookup, key)) {
            lookup[key] = 1;
            summary.count++;
        }
    }

    return {entities: _.values(entitySummaries), resultCount: labels.length};
}

function searchSplunkPivot({app, pivot}) {
    //TODO when constrained investigation pivotset templating, change 'all'-> investigation.templates
    const template = PivotTemplates.get('all', pivot.pivotParameters.mode);

    if (template.transport !== 'Splunk') {
        throw new Error('Only expected Splunk transports, got: ' + template.transport);
    }

    const searchQuery = template.splunk.toSplunk(pivot.pivotParameters, pivotCache);

    console.log('======= Search ======')
    console.log(searchQuery);

    const splunkResults = searchSplunk(searchQuery)
        .do(({resultCount, output}) => {
            pivot.resultCount = resultCount;
        })
        .do(({output, splunkSearchID}) => {
            pivotCache[pivot.id] = { results: output, query:searchQuery, splunkSearchID };
            console.log('saved pivot ', pivot.id, '# results:', output.length);
        })
        .map(({output}) => output);

    return shapeSplunkResults(splunkResults, pivot.pivotParameters, pivot.id, template.splunk, pivot.rowId)
        .do((results) => {
            pivot.results = results;
            pivot.resultSummary = summarizeOutput(results);
            pivot.status = {ok: true};
        })
        .map((results) => ({app, pivot}));
}

export function searchPivot({loadPivotsById, pivotIds, rowIds}) {
    return loadPivotsById({pivotIds: pivotIds, rowIds: rowIds})
        .mergeMap(({app, pivot}) => {
            pivot.enabled = true;
            const template = PivotTemplates.get('all', pivot.pivotParameters.mode);

            return template.searchAndShape({app, pivot})
                .catch(e => {
                    console.error(e);
                    pivot.status = {
                        ok: false,
                        message: e.message || 'Unknown Error'
                    };
                    return Observable.of({app, pivot});
                });
        });
}
