import _ from 'underscore';

import logger from '../../../../shared/logger.js';
const log = logger.createLogger(__filename);


//Special casing of [search] -[field]-> [source]
//   search can be "{{###pivot###,###pivot###,...}}""
//   field can be  "field1, field2,field3, ..."
//   source is any search
// String * {pivotId -> pivot } -> String U undefined
export function expandArrow(text, pivotCache) {

    const hit = text.match(/\[{{(.*)}}] *-\[(.*)]-> *\[(.*)]/);
    if (hit) {
        const pivotIds = hit[1].split(',');
        const fields = hit[2].split(',')
            .map(s => s.trim())
            .map(s => s[0] === '"' ? s.slice(1,-1).trim() : s);
        const source = hit[3];

        log.trace({pivotIds, fields, source}, 'Looking at');
        let match = '';
        pivotIds.forEach((pivotId) => {
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const vals = _.uniq(_.map(pivotCache[pivotId].events, function (row) {
                    return row[field];
                }));
                const fieldMatch = `"${ field }"="${ vals.join(`" OR "${ field }"="`) }"`;
                match = match + (match ? ' OR ' : '') + fieldMatch;
            }
        });
        return `${ source } ${ match } | head 10000 `;
    } else {
        return undefined;
    }

}