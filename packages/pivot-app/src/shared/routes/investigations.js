import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';

import { getHandler,
    setHandler,
    mapObjectsToAtoms,
    captureErrorStacks } from './support';

export function investigations({ loadInvestigationsById, loadPivotsById, searchPivot, splicePivot, insertPivot, uploadGraph }) {

    const getInvestigationsHandler = getHandler(['investigation'], loadInvestigationsById);
    const setInvestigationsHandler = setHandler(['investigation'], loadInvestigationsById);

    return [{
        returns: `String`,
        get: getInvestigationsHandler,
        set: setInvestigationsHandler,
        route: `investigationsById[{keys}]['id','name', 'value', 'url', 'status']`
    }, {
        returns: `Number`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['pivots']['length']`
    }, {
        returns: `pivots`,
        get: getInvestigationsHandler,
        route: `investigationsById[{keys}]['pivots'][{integers}]`
    }, {
        route: `investigationsById[{keys}].play`,
        call: playCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot, uploadGraph })
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
                $pathValue(`investigationsById['${id}'].length`, investigation.pivots.length),
                $invalidation(`investigationsById['${id}']['pivots'][${0}..${investigation.pivots.length}]`),
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
            const pivots = investigation.pivots
            const length = pivots.length;
            const values = [
                $pathValue(`investigationsById['${id}']['pivots'].length`, length),
                $pathValue(`investigationsById['${id}']['pivots'][${nextIndex}]`, pivots[nextIndex]),
            ];

            if (nextIndex < length - 1) {
                values.push($invalidation(`investigationsById['${id}']['pivots'][${nextIndex + 1}..${length - 1}]`));
            }

            return values;
        })
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks);
    };
}

function playCallRoute({ loadInvestigationsById, loadPivotsById, uploadGraph }) {
    return function playInvestigationCall(path, args) {
        console.log('Play was called!')
        const id = path[1];
        const index = args[0];

        return loadInvestigationsById({investigationIds: id})
            .mergeMap(
                ({app, investigation}) => {
                    if (!investigation.status) {
                        return loadPivotsById({pivotIds: investigation.pivots.map(x => x.value[1])})
                            .map(({app, pivot}) => pivot)
                            .reduce((acc, x) => acc.concat([x]), [])
                            .switchMap(pivots => {
                                return uploadGraph({app, pivots: pivots})
                            })
                    } else {
                        return Observable.empty();
                    }
                },
                ({app, investigation}, name) => ({
                    app, index, name, investigation
                })
            )
        .mergeMap(({investigation, name }) => {
            investigation.url = (process.env.GRAPHISTRY_VIEWER || process.env.GRAPHISTRY || 'https://labs.graphistry.com')
                + '/graph/graph.html?play=500&bg=%23eeeeee&type=vgraph&info=true&dataset=' + name;
            console.log('  URL: ', investigation.url);
            const values = [
                $pathValue(`investigationsById['${id}'].url`, investigation.url),
                $pathValue(`investigationsById['${id}'].status`, null)
            ];

            return values;
        })
        .catch(notifyClientOfErrors(id))
        .map(mapObjectsToAtoms)
        .catch(captureErrorStacks)
    }
}

function searchPivotCallRoute({ loadInvestigationsById, loadPivotsById, searchPivot}) {
    return function searchPivotCall(path, args) {
        const id = path[1];
        const index = args[0];

        return loadInvestigationsById({investigationIds: id})
            .mergeMap(({app, investigation}) => {
                const pivotId = investigation.pivots[index].value[1];

                return loadPivotsById({pivotIds: [pivotId]}).mergeMap(({app, pivot}) => {
                    if (pivot.enabled) { //TODO Suspicious
                        return searchPivot({app, investigation, pivot, index})
                            .mergeMap(({investigation, pivot, app}) => {
                                investigation.status = null
                                return [
                                    $pathValue(`pivotsById['${pivot.id}']['resultCount']`, pivot.resultCount),
                                    $pathValue(`pivotsById['${pivot.id}']['resultSummary']`, pivot.resultSummary),
                                    $pathValue(`pivotsById['${pivot.id}']['enabled']`, pivot.enabled),
                                    $pathValue(`investigationsById['${id}'].status`, null)
                                ];

                            })
                            .catch(notifyClientOfErrors(investigation.id))
                            .map(mapObjectsToAtoms);
                    } else {
                        return Observable.of([]);
                    }
                })

            })
            .catch(captureErrorStacks)
    }
}

function notifyClientOfErrors(investigationId) {
    return function(e) {
        console.error(e);

        const status = {
            type: 'danger',
            message: e.message
        };

        const value = $pathValue(`investigationsById['${investigationId}'].status`, status);
        return Observable.from([value]);
    }
}
