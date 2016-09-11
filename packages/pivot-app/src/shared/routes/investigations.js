import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';

import { getHandler,
         mapObjectsToAtoms,
         captureErrorStacks } from './support';

export function investigations({ loadInvestigationsById, loadPivotsById, searchPivot, splicePivot, insertPivot, uploadGraph }) {

    const getInvestigationsHandler = getHandler(['investigation'], loadInvestigationsById);

    return [{
        returns: `Number`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['length']`
    }, {
        returns: `String`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['id','name', 'value', 'url']`
    }, {
        returns: `pivots`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}][{integers}]`
    }, {
        route: `investigationsById[{keys}].searchPivot`,
        call: searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot, uploadGraph })
    }, {
        route: `investigationsById[{keys}].insertPivot`,
        call: insertPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot, insertPivot})
    }, {
        route: `investigationsById[{keys}].splicePivot`,
        call: splicePivotCallRoute({ loadInvestigationsById, loadPivotsById, splicePivot})
    }];
}

function splicePivotCallRoute({ loadInvestigationsById, splicePivot }) {
    return function splicePivotCall(path, args) {
        const id = path[1];
        const index = args[0];
        return loadInvestigationsById({investigationIds: id})
            .mergeMap(
                ({ app, investigation}) => splicePivot({ app, index, id, investigation })
        )
        .mergeMap(({ investigation }) => {
            const values = [
                $pathValue(`investigationsById['${id}'].length`, investigation.length),
                $invalidation(`investigationsById['${id}'][${0}..${investigation.length}]`),
            ];
            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    };
}

function insertPivotCallRoute({ loadInvestigationsById, insertPivot }) {
    return function insertPivotCall(path, args) {
        const id = path[1];
        const clickedIndex = args[0];
        return loadInvestigationsById({investigationIds: id})
            .mergeMap(
            ({ app, investigation}) => insertPivot({ app, clickedIndex, id, investigation })
        )
        .mergeMap(({ investigation, nextIndex }) => {
            const length = investigation.length;
            const values = [
                $pathValue(`investigationsById['${id}'].length`, investigation.length),
                $pathValue(`investigationsById['${id}'][${nextIndex}]`, investigation[nextIndex]),
            ];

            if (nextIndex < investigation.length - 1) {
                values.push($invalidation(`investigationsById['${id}'][${nextIndex + 1}..${length - 1}]`));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    };
}

function searchPivotCallRoute({ loadInvestigationsById, searchPivot, uploadGraph }) {
    return function searchPivotCall(path, args) {
        const id = path[1];
        const index = args[0];
        return loadInvestigationsById({investigationIds: id})
            .mergeMap(
            ({app, investigation}) => searchPivot({ app, investigation, index })
        )
        .mergeMap(
            ({app, investigation}) => uploadGraph({ app, investigation }),
            ({app, investigation, pivot}, name) => ({
                app, index, name, investigation, pivot
            })
        )
        .mergeMap(({investigation, pivot, name }) => {
            investigation.url = (process.env.GRAPHISTRY_VIEWER || process.env.GRAPHISTRY || 'https://labs.graphistry.com')
                + '/graph/graph.html?play=500&bg=%23eeeeee&type=vgraph&dataset=' + name;
            const values = [
                $pathValue(`investigationsById['${id}'].url`, investigation.url),
                $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
            ];

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    };
}
