import { inspect } from 'util';
const  { slice } = Array.prototype;
import { mapObjectsToAtoms } from './mapObjectsToAtoms';
import { captureErrorStacks } from './captureErrorStacks';

export function setHandler(lists, loader, mapValue, { valueKey, ...props } = {}) {
    return function handler(json) {

        const { request = {} } = this;
        const { query: options = {} } = request;
        const { state, suffix } = getListsAndSuffixes(
            { ...props, options }, [], lists, 0, json
        );

        const loaded = suffix.reduce((source, json, index) => source.mergeMap(
                ({ data, idxs }) => expandJSON(json, index, { data, idxs }, valueKey)
            ),
            loader(state).map((data) => ({ data, idxs: { length: 0 } }))
        );

        const values = loaded.map(({ data, idxs, vals }) => {

            const path = [];
            let index = -1, count = lists.length,
                key, type, pathId = -1, valsId = -1,
                value = data[lists[count - 1]] || data;

            while (++index < count) {
                key = lists[index];
                path[++pathId] = `${key}sById`;
                path[++pathId] = data[key].id;
            }

            index = 0;
            count = idxs.length;

            do {
                if (value.$type) {
                    value = { path, value };
                    break;
                }

                key = idxs[index];
                path[++pathId] = key;

                value = index < count - 1 ?
                    value[key] || (value[key] = {}) :
                    { path, value: value[key] = !mapValue ?
                            vals : mapValue(vals, path, data) };

            } while (++index < count);

            return value;
        });

        return (values
            .map(mapObjectsToAtoms)
            .do((pv) => {
                console.log(`set: ${JSON.stringify(json)}`);
                console.log(`res: ${JSON.stringify(pv.path)}`);
            })
            .catch(captureErrorStacks)
        );
    }
}

function getListsAndSuffixes(state, suffix, lists, depth, json) {

    if (!json || json.$type ||
        depth === lists.length ||
        typeof json !== 'object') {
        suffix.push(json);
    } else {

        const list = `${lists[depth]}Ids`;
        const byId = `${lists[depth]}sById`;
        const node = json[byId];

        let keyIdx = -1;
        const keys = state[list] || (state[list] = []);

        for (const key in node) {

            const next = node[key];

            keys[++keyIdx] = key;

            getListsAndSuffixes(state, suffix, lists, depth + 1, next);
        }
    }

    return { state, suffix };
}

function expandJSON(json, index, { data, idxs, vals }, valueKey) {
    if (!json || json.$type || typeof json !== 'object') {
        return [{ data, idxs, vals }];
    }
    return mergeMapArray(Object.keys(json), (key, vals = json[key]) => (
        key === valueKey ? [{
            vals, data, idxs: {
                ...idxs,
                [index]: key,
                length: index + 1
            }
        }] :
        expandJSON(json[key], index + 1, {
            vals, data, idxs: {
                ...idxs,
                [index]: key,
                length: index + 1
            }
        }, valueKey)
    ));
}

function mergeMapArray(xs, fn) {
    let ix = -1;
    const list = [];
    const { length } = xs;
    while (++ix < length) {
        list.push.apply(list, fn(xs[ix]));
    }
    return list;
}
