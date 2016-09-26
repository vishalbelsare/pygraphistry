import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
    error as $error
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';

import {
    getHandler,
    setHandler,
    mapObjectsToAtoms,
    captureErrorStacks,
    logErrorWithCode
} from './support';

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
        const investigationIds = path[1];
        const pivotIndex = args[0];

        return Observable.defer(() => splicePivot({loadInvestigationsById, investigationIds,
                                                   pivotIndex, deleteCount: 1}))
            .mergeMap(({app, investigation}) => {
                return [
                    $pathValue(`investigationsById['${investigationIds}']['pivots'].length`, investigation.pivots.length),
                    $invalidation(`investigationsById['${investigationIds}']['pivots'][${0}..${investigation.pivots.length}]`)
                ];
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorAndNotifyClient(investigationIds));
    };
}

function insertPivotCallRoute({ loadInvestigationsById, insertPivot }) {
    return function insertPivotCall(path, args) {
        const investigationIds = path[1];
        const pivotIndex = args[0];

        return Observable.defer(() => insertPivot({loadInvestigationsById, investigationIds, pivotIndex}))
            .mergeMap(({investigation, insertedIndex}) => {
                const pivots = investigation.pivots
                const length = pivots.length;

                const values = [
                    $pathValue(`investigationsById['${investigation.id}']['pivots'].length`, length),
                    $pathValue(`investigationsById['${investigation.id}']['pivots'][${insertedIndex}]`, pivots[insertedIndex]),
                ];

                if (insertedIndex < length - 1) { // Inserted pivot is not the last one in the list
                    values.push($invalidation(
                        `investigationsById['${investigation.id}']['pivots'][${insertedIndex + 1}..${length - 1}]`
                    ));
                }

                return values;
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function playCallRoute({ loadInvestigationsById, loadPivotsById, uploadGraph }) {
    return function playInvestigationCall(path, args) {
        const investigationIds = path[1];

        return Observable.defer(() => uploadGraph({loadInvestigationsById, loadPivotsById, investigationIds}))
            .mergeMap(({app, investigation}) => {
                return [
                    $pathValue(`investigationsById['${investigationIds}'].url`, investigation.url),
                    $pathValue(`investigationsById['${investigationIds}'].status`, investigation.status)
                ];
            })
            .map(mapObjectsToAtoms)
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function captureErrorAndNotifyClient(investigationIds) {
    return function(e) {
        const errorCode = logErrorWithCode(e);
        const status = {
            ok: false,
            code: errorCode,
            message: `Server Error (code: ${errorCode})`
        }

        return Observable.from([
            $pathValue(`investigationsById['${investigationIds}']['status']`, $error(status))
        ]);
    }
}
