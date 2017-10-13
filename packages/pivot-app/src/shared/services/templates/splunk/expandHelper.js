import _ from 'underscore';

import logger from 'pivot-shared/logger';
const log = logger.createLogger(__filename);

function getFields(str, events) {
    const fields = str
        .split(',')
        .map(s => s.trim())
        .map(s => (s[0] === '"' ? s.slice(1, -1).trim() : s));

    if (fields.indexOf('*') > -1) {
        const hits = {};
        events.forEach(row => {
            for (const key in row) {
                hits[key] = true;
            }
        });
        return Object.keys(hits);
    } else {
        return fields;
    }
}

//DEPRECATED, USE expand::expand()
//Special casing of [search] -[field]-> [source]
//   search can be "{{###pivot###,###pivot###,...}}""
//   field can be  "field1, field2,field3, ..."
//   source is any search
// String * {pivotId -> pivot } -> String U undefined
export function expandArrow(text, pivotCache, colMatch = true) {
    log.warn('DEPRECATED, use expand:expand()');

    const hit = text.match(/\[{{(.*)}}] *-\[(.*)]-> *\[(.*)]/);
    if (hit) {
        const pivotIds = hit[1].split(',');
        const fieldsStr = hit[2];
        const source = hit[3];

        log.trace({ pivotIds, fieldsStr, source }, 'Looking at');
        let match = '';
        pivotIds.forEach(pivotId => {
            const fields = getFields(fieldsStr, pivotCache[pivotId].events);
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const vals = _.uniq(_.map(pivotCache[pivotId].events, row => row[field]))
                    .filter(v => v !== null && v !== undefined)
                    .map(v =>
                        String(v)
                            .replace(/([\r\n])/gm, '')
                            .replace(/"/g, '\\"')
                            .trim()
                    )
                    .filter(v => v.length && v !== `""`);
                const prefix = colMatch ? `"${field}"="` : `"`;
                const joiner = `" OR "${colMatch ? `${field}"="` : ''}`;
                const fieldMatch = `${prefix}${vals.join(joiner)}"`;
                if (fieldMatch !== '' && fieldMatch !== `""`) {
                    match = match + (match ? ' OR ' : '') + fieldMatch;
                }
            }
        });
        return `${source} ${match} | head 10000 `;
    } else {
        return undefined;
    }
}
