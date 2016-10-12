import { inspect } from 'util';
import { Observable } from 'rxjs';
const  { slice } = Array.prototype;
import { mapObjectsToAtoms } from './mapObjectsToAtoms';
import { captureErrorStacks } from './captureErrorStacks';

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
                if (index === count || value === undefined || typeof value !== 'object') {
                    vals[++valsId] = { path, value };
                    break;
                } else if (type = value.$type) {
                    vals[++valsId] = { path, value };
                    if (type === 'ref') {
                        idxs = slice.call(idxs, index);
                        value = value.value.concat(idxs);
                        vals[++valsId] = { path: path.concat(idxs),
                                           value: { $type: 'ref', value: value } };
                        vals[++valsId] = { isMessage: true, additionalPath: value };
                    }
                    break;
                }
                key = idxs[index];
                value = value[key];
                path[++pathId] = key;
            } while (++index <= count);

            return vals;
        });

        return (values
            .map(mapObjectsToAtoms)
            // .do((pv) => {
            //     if (pv.isMessage) {
            //         console.log(`additionalPath: ${JSON.stringify(pv.additionalPath)}`);
            //     } else {
            //         console.log(`res: ${JSON.stringify(pv.path)}`);
            //     }
            // })
            .catch(captureErrorStacks)
        );
    }
}

function keysetToKeysList(keys) {
    if (!keys || 'object' !== typeof keys) {
        return [keys];
    } else if (Array.isArray(keys)) {
        return keys;
    }
    let rangeEnd = keys.to;
    let rangeStart = keys.from || 0;
    if ('number' !== typeof rangeEnd) {
        rangeEnd = rangeStart + (keys.length || 0) - 1;
    }
    return Array.from(
        {length: rangeEnd - rangeStart },
        (x, index) => index + rangeStart
    );
}
