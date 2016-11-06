import { Observable } from 'rxjs';

import {
    ref as $ref,
    atom as $atom,
    pathValue as $value
} from '@graphistry/falcor-json-graph';
import Color from 'color';
import { getHandler,
         setHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from 'viz-shared/routes';

import _ from 'underscore';


export function inspector(path, base) {
    return function inspector({ loadViewsById, readSelection }) {

        const getValues = getHandler(path, loadViewsById);
        const setValues = setHandler(path, loadViewsById);

        return [{
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector']['open', 'length', 'id', 'name', 'templates']`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].query[{keys}]`,
        }, {
            get: getValues,
            route: `${base}['inspector'].controls[{keys}]`
        }, {
            get: getValues,
            set: setValues,
            route: `${base}['inspector'].controls[{keys}][{keys}]`
        }, {
            returns: `*`,
            get: search.bind(null, {loadViewsById, readSelection}),
            route: `${base}['inspector'].rows[{keys:openTab}][{keys:searchTerm}][{keys:sortKey}][{keys:sortOrder}][{ranges:rows}][{keys:fields}]`
        }];
    }
}


function search ({loadViewsById, readSelection}, path) {

    //======= DEFS

    const basePath = path.slice(0, path.length - 6);

    console.log('======= ORIGINAL BASE PATH',
        JSON.stringify(basePath));

    const workbookIds = [].concat(path[1]);
    const viewIds = [].concat(path[3]);
    const openTabs = [].concat(path[path.length - 6]);
    const searchTerms = [].concat(path[path.length - 5]);
    const sortKeys = [].concat(path[path.length - 4]);
    const sortOrders = [].concat(path[path.length - 3]);
    const ranges = [].concat(path[path.length - 2]);
    const fields = [].concat(path[path.length - 1]);


    //======= HELPERS

    var queryPage = function ({view, openTab, range}) {
        const {from, to} = range;
        return readSelection({
            view,
            type: openTab === 'points' ? 'point' : 'edge',
            query: {
                sel: {all: true},
                page: 1,
                per_page: to - from + 1,
                sort_by: openTab === 'points' ? 'community_infomap' : 'label',
                order: 'asc',
                search: null
            }
        })
    };

    var pageToValue = function (
            {workbook, view, openTab, searchTerm, sortKey, sortOrder, range, fields},
            page) {

        const fragment =
            _.object(
                page.values.map((v,idx)=> range.from + idx),
                page.values.map((o) => _.pick(o, ...fields)));

        /* Try making fragment include basePath
        const resolved = {workbooksById: {
                [basePath[1]]: {
                    viewsById: {
                        [basePath[3]]: fragment
                    }
                }
            }
        };
        */

        /* Try flattening basePath
        const flatBasePath = basePath.map((o) => typeof(o) === 'object' ? o[0] : 0);
        */

        return {
            jsonGraph: fragment,
            paths:
                [
                    basePath
                        .concat([
                            openTab, searchTerm, sortKey, sortOrder,
                            range,//_.range(range.from, range.to+1),
                            fields])
                ]
        };
    };

    //======= ETL

    return loadViewsById({
        workbookIds, viewIds
    })
    .mergeMap(({ workbook, view }) => {

        //iterate over query combos to generate/run/format needed searches (hopefully, only 1!)
        const queries = openTabs.reduce((values, openTab) =>
            searchTerms.reduce((values, searchTerm) =>
                sortKeys.reduce((values, sortKey) =>
                    sortOrders.reduce((values, sortOrder) =>
                        ranges.reduce((values, range) =>
                            values.concat(
                                [{workbook, view,
                                 openTab, searchTerm, sortKey, sortOrder, range, fields}]),
                        values),
                    values),
                values),
            values),
        []);

        console.log('query0', _.omit(queries[0], 'workbook', 'view'));

        const searches =
            queries.map((query) =>
                queryPage(query)
                    .map(pageToValue.bind(null, query)));

        return Observable.merge(...searches)
            .do((e) => console.log('search hit',
                e.paths[0], e.jsonGraph));
    });
};