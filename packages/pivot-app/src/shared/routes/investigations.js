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
        const investigationIds = path[1];

        return Observable.defer(() => uploadGraph({loadInvestigationsById, loadPivotsById, investigationIds}))
            .mergeMap(({app, investigation}) => {
                return [
                    $pathValue(`investigationsById['${investigationIds}'].url`, investigation.url),
                    $invalidation(`investigationsById['${investigationIds}'].status`)
                ];
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorStacks);
    }
}

function notifyClientOfErrors(investigationIds) {
    return function(e) {
        console.log(investigationIds)
        console.error(e);

        const status = {
            type: 'danger',
            message: e.message || 'Unknown Error'
        };

        const value = $pathValue(`investigationsById['${investigationIds}'].status`, status);
        return Observable.from([value]);
    }
}

function captureErrorAndNotifyClient(investigationIds) {
    return function(e) {
        captureErrorStacks(e);

        return Observable.from([
            $pathValue(`investigationsById['${investigationIds}']['status']`)
        ]);
    }
}
