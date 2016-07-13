import { inspect } from 'util';
import { mapObjectsToAtoms } from './mapObjectsToAtoms';
import { captureErrorStacks } from './captureErrorStacks';

export function getHandler(lists, loader, props = {}) {
    return function handler(path) {

        const { request = {} } = this;
        const { query: options = {} } = request;
        const state = lists.reduce(
            (state, list, index) => ({
                ...state, [`${list}Ids`]: [].concat(path[1 + (index * 2)])
            }), { ...props, options });

        const suffix = path.slice(lists.length * 2);
        const loaded = suffix.reduce((source, keys, index) => source.mergeMap(
                ({ data, idxs }) => [].concat(keys),
                ({ data, idxs }, key) => ({
                    data, idxs: {
                        ...idxs,
                        [index]: key,
                        length: index + 1
                    }
                })
            ),
            loader(state).map((data) => ({ data, idxs: { length: 0 } }))
        );

        const values = loaded.map(({ data, idxs }) => {

            const seed = data[lists[lists.length - 1]] || data;
            const path = lists.reduce((path, key) => path.concat(
                `${key}sById`, data[key].id
            ), []);

            return (Array
                .from(idxs, (key, index) => idxs[index])
                .reduce(
                    ({ path, value }, key) => ({
                        path: path.concat(key),
                        value: value && value[key]
                    }),
                    { path, value: seed }
                ));
        });

        return (values
            .map(mapObjectsToAtoms)
            // .do((pv) => {
            //     console.log(`req: ${JSON.stringify(path)}`);
            //     console.log(`res: ${JSON.stringify(pv.path)}`);
            // })
            .catch(captureErrorStacks)
        );
    }
}
