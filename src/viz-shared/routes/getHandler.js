const typeofNumber = 'number';
const typeofObject = 'object';
const  { slice } = Array.prototype;
import { inspect } from 'util';
import { Observable } from 'rxjs';

function defaultPropsResolver(routerInstance) {
    const { request  = {} } = routerInstance;
    const { query = {} } = request;
    return query;
}

export function getHandler(lists, loader, getInitialProps = defaultPropsResolver) {
    return function handler(path) {

        // console.log(`get: ${JSON.stringify(path)}`);

        const state = { ...getInitialProps(this) };

        let list, index = -1, count = lists.length;

        while (++index < count) {
            list = lists[index];
            state[`${list}Ids`] = [].concat(
                path[1 + (index * 2)]
            );
        }

        const suffix = slice.call(path, count * 2);
        const loaded = suffix.reduce((source, keys, index) => source.mergeMap(
                ({ data, idxs }) => keysetToKeysList(keys),
                ({ data, idxs }, key) => ({
                    data, idxs: {
                        ...idxs,
                        [index]: key,
                        length: index + 1
                    }
                })
            ),
            Observable
                .defer(() => loader(state))
                .map((data) => ({ data, idxs: { length: 0 } }))
        );

        const values = loaded.mergeMap(({ data, idxs }) => {

            data = data || {};

            const vals = [], path = [];
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
                if (value === undefined) {
                    // vals[++valsId] = { value, path: path
                    //     .concat(slice.call(idxs, index)) };
                    break;
                } else if (index === count || typeofObject !== typeof value) {
                    vals[++valsId] = { value, path };
                    break;
                } else if (type = value.$type) {
                    vals[++valsId] = { value, path };
                    break;
                }
                key = idxs[index];
                value = value[key];
                path[++pathId] = key;
            } while (++index <= count);

            return vals;
        });

        return values;
    }
}

function keysetToKeysList(keys) {
    if (!keys || typeofObject !== typeof keys) {
        return [keys];
    } else if (Array.isArray(keys)) {
        return keys;
    }
    let rangeEnd = keys.to;
    let rangeStart = keys.from || 0;
    if (typeofNumber !== typeof rangeEnd) {
        rangeEnd = rangeStart + (keys.length || 0) - 1;
    }
    return Array.from(
        {length: rangeEnd - rangeStart},
        (x, index) => index + rangeStart
    );
}
