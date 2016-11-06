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
            route: `${base}['inspector']['open', 'openTab', 'length', 'id', 'name', 'templates', 'currentQuery']`,
        }, {
            returns: `*`,
            get: getValues,
            set: setValues, //should update rows..
            route: `${base}['inspector'].queries[{keys}][{keys}]`,
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

    const workbookIds = [].concat(path[1]);
    const viewIds = [].concat(path[3]);
    const openTabs = [].concat(path[path.length - 6]);
    const searchTerms = [].concat(path[path.length - 5]);
    const sortKeys = [].concat(path[path.length - 4]);
    const sortOrders = [].concat(path[path.length - 3]);
    const ranges = [].concat(path[path.length - 2]);
    const fields = [].concat(path[path.length - 1]);


    //======= HELPERS

    var queryPage = function ({view, openTab, range, searchTerm, sortKey, sortOrder}) {
        const {from, to} = range;

        return readSelection({
            view,
            type: openTab === 'points' ? 'point' : 'edge',
            query: {
                sel: {all: true},
                page: 1,
                per_page: to - from + 1,
                sort_by: !sortKey ? null : sortKey,
                order: sortOrder,
                search: searchTerm
            }
        })
    };

    var pageToValue = function (
            {workbook, view, openTab, searchTerm, sortKey, sortOrder, range, fields},
            page) {

        //{...range: { ...fields} }
        const fragment =
            _.object(
                page.values.map((v,idx)=> range.from + idx),
                page.values.map((o) => _.pick(o, fields)));

        //[openTab, `search-`, `sort-`, sortOrder]
        const midFragment = {
            [openTab]: {
                [`search-${searchTerm||''}`]: {
                    [`sort-${sortKey||''}`]: {
                        [sortOrder]: fragment } } } };

        //basePath
        const fullFragment = {
            workbooksById: {
                [basePath[1][0]]: {
                    viewsById: {
                        [basePath[3][0]]: {
                            inspector: {
                                rows: midFragment } } } } } };

        const prefix =
            ['workbooksById', [basePath[1][0]], 'viewsById', [basePath[3][0]],
            'inspector', 'rows',
            [openTab], [`search-${searchTerm||''}`], [`sort-${sortKey||''}`], [sortOrder]];

        const paths = [ prefix.concat([ [range], fields]) ];

        return {paths, jsonGraph: fullFragment };
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
                                 openTab,
                                 searchTerm: searchTerm.slice('search-'.length),
                                 sortKey: sortKey.slice('sort-'.length),
                                 sortOrder, range, fields}]),
                        values),
                    values),
                values),
            values),
        []);

        const searches =
            queries.map((query) =>
                queryPage(query)
                    .map(pageToValue.bind(null, query)));

        return Observable.merge(...searches);

    });
};