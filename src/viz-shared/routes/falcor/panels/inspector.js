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
            get: searchCount.bind(null, {loadViewsById, readSelection}),
            route: `${base}['inspector'].rows[{keys:openTabs}][{keys:searchTerms}][{keys:sortKeys}][{keys:sortOrders}].count`
        }, {
            returns: `*`,
            get: searchRows.bind(null, {loadViewsById, readSelection}),
            route: `${base}['inspector'].rows[{keys:openTabs}][{keys:searchTerms}][{keys:sortKeys}][{keys:sortOrders}][{ranges:rows}][{keys:fields}]`
        }];
    }
}

//====== HELPERS ====
function queryPage ({readSelection}, {view, openTab, range, searchTerm, sortKey, sortOrder}) {
    const {from, to} = range;

    const perPage = to - from + 1;
    const page = 1 + Math.floor(to / perPage);

    let { selection: { mask: rect } = {} } = view;

    rect = rect && rect.value || rect;
    if (!rect || !rect.tl || !rect.br) {
        rect = { all: true };
    }

    const query =
        {
            type: openTab === 'points' ? 'point' : 'edge',
            query: {
                sel: rect,
                page: page,
                per_page: to - from + 1,
                sort_by: !sortKey ? null : sortKey,
                order: sortOrder,
                search: searchTerm
            }
        };
    return readSelection({view, ...query });
}

function generateQueries(
        {workbook, view},
        {openTabs, searchTerms, sortKeys, sortOrders, rows, fields}) {

    return openTabs.reduce((values, openTab) =>
            searchTerms.reduce((values, searchTerm) =>
                sortKeys.reduce((values, sortKey) =>
                    sortOrders.reduce((values, sortOrder) =>
                        rows.reduce((values, range) =>
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
}

function genPathPrefix (basePath, {openTab, searchTerm, sortKey, sortOrder}) {
    return [
        'workbooksById', [basePath[1][0]], 'viewsById', [basePath[3][0]],
        'inspector', 'rows',
        [openTab], [`search-${searchTerm||''}`], [`sort-${sortKey||''}`], [sortOrder]
    ];
}

//////////// ROW QUERY


//TODO also return count path, even though not part of the explicit request
function pageToRows (
        {basePath},
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

    const prefix = genPathPrefix(basePath, {openTab, searchTerm, sortKey, sortOrder});

    const paths = [ prefix.concat([ [range], fields]) ];

    return {paths, jsonGraph: fullFragment };
}

function searchRows ({loadViewsById, readSelection}, path) {

    const basePath = path.slice(0, path.length - 6);
    const workbookIds = [].concat(path[1]);
    const viewIds = [].concat(path[3]);
    const { openTabs, searchTerms, sortKeys, sortOrders, rows, fields } = path;

    return loadViewsById({
        workbookIds, viewIds
    })
    .mergeMap(({ workbook, view }) => {

        const queries = generateQueries(
            {workbook, view},
            {openTabs, searchTerms, sortKeys, sortOrders, rows, fields});

        const searches =
            queries.map((query) =>
                queryPage({readSelection}, query)
                    .map(pageToRows.bind(null, {basePath}, query)));

        return Observable.merge(...searches);

    });
};



//////////// COUNT QUERY


function pageToCount (
        basePath,
        {workbook, view,
         openTab, searchTerm, sortKey, sortOrder, range, fields },
         page) {

    const prefix = genPathPrefix(basePath, {openTab, searchTerm, sortKey, sortOrder});
    const paths = prefix.concat(['count']);

    return $value(paths, page.count);
}


function searchCount ({loadViewsById, readSelection}, path) {

    const basePath = path.slice(0, path.length - 6);
    const workbookIds = [].concat(path[1]);
    const viewIds = [].concat(path[3]);

    const {openTabs, searchTerms, sortKeys, sortOrders} = path;
    const rows = [ {from: 0, to: 1} ];
    const fields = [];

    return loadViewsById({
        workbookIds, viewIds
    })
    .mergeMap(({ workbook, view }) => {

        const queries = generateQueries(
            {workbook, view},
            {openTabs, searchTerms, sortKeys, sortOrders, rows, fields});

        const searches =
            queries.map((query) =>
                queryPage({readSelection}, query)
                    .map(pageToCount.bind(null, basePath, query)));

        return Observable.merge(...searches);

    });
}
