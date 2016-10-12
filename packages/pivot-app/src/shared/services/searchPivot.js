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
    const hist = {};
    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type] = {count: 0, example: i, name: '', color: ''};
    }
    const summaries = _.values(hist);

    for (var i = 0; i < labels.length; i++) {
        hist[labels[i].type].count++;
    }

    _.each(summaries, (summary) => {
        summary.name = labels[summary.example].type;
        summary.color = intToHex(categoryToColorInt[labels[summary.example].pointColor]);
    });

    return {entities: summaries, resultCount: labels.length};
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

    return shapeSplunkResults(splunkResults, pivot.pivotParameters, pivot.id, template.splunk)
        .do((results) => {
            pivot.results = results;
            pivot.resultSummary = summarizeOutput(results);
            pivot.status = {ok: true};
        })
        .map((results) => ({app, pivot}));
}

export function searchPivot({loadPivotsById, pivotIds}) {
    return loadPivotsById({pivotIds: pivotIds})
        .mergeMap(({app, pivot}) => {
            pivot.enabled = true;
            const template = PivotTemplates.get('all', pivot.pivotParameters.mode);

            return template.splunk.search({app, pivot})
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
