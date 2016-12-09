import {
    pathValue as $pathValue,
    pathInvalidation as $invalidation,
    error as $error
} from '@graphistry/falcor-json-graph';
import { Observable } from 'rxjs';
import {
    getHandler,
    setHandler,
    logErrorWithCode
} from './support';
import logger from '../logger.js';
const log = logger.createLogger('pivot-app', __filename);


export function investigations({ loadUsersById, loadInvestigationsById, saveInvestigationsById,
                                 loadPivotsById, savePivotsById, cloneInvestigationsById,
                                 searchPivot, splicePivot, insertPivot, uploadGraph }) {

    const getInvestigationsHandler = getHandler(['investigation'], loadInvestigationsById);
    const setInvestigationsHandler = setHandler(['investigation'], loadInvestigationsById);

    return [{
        route: `investigationsById[{keys}]['id','name', 'url', 'status', 'description']`,
        returns: `String`,
        get: getInvestigationsHandler,
        set: setInvestigationsHandler,
    }, {
        route: `investigationsById[{keys}]['tags']`,
        returns: `Array`,
        get: getInvestigationsHandler,
        set: setInvestigationsHandler,
    }, {
        route: `investigationsById[{keys}]['eventTable']`,
        returns: `Object`,
        get: getInvestigationsHandler
    }, {
        route: `investigationsById[{keys}]['modifiedOn']`,
        returns: `Number`,
        get: getInvestigationsHandler,
        set: setInvestigationsHandler,
    }, {
        route: `investigationsById[{keys}]['pivots']['length']`,
        returns: `Number`,
        get: getInvestigationsHandler,
    }, {
        route: `investigationsById[{keys}]['pivots'][{integers}]`,
        returns: `$ref('pivotsById[{pivotId}]'`,
        get: getInvestigationsHandler,
    }, {
        route: `investigationsById[{keys}].play`,
        call: playCallRoute({ loadInvestigationsById, loadPivotsById, loadUsersById, uploadGraph })
    }, {
        route: `investigationsById[{keys}].insertPivot`,
        call: insertPivotCallRoute({ loadInvestigationsById, insertPivot})
    }, {
        route: `investigationsById[{keys}].splicePivot`,
        call: splicePivotCallRoute({ loadInvestigationsById, splicePivot})
    }, {
        route: `investigationsById[{keys}].save`,
        call: saveCallRoute({ loadInvestigationsById, saveInvestigationsById, savePivotsById})
    }, {
        route: `investigationsById[{keys}].clone`,
        call: cloneCallRoute({ loadInvestigationsById, loadPivotsById, loadUsersById, cloneInvestigationsById})
    }];
}

function splicePivotCallRoute({ loadInvestigationsById, splicePivot }) {
    return function(path, args) {
        const investigationIds = path[1];
        const pivotIndex = args[0];

        return splicePivot({loadInvestigationsById, investigationIds, pivotIndex, deleteCount: 1})
            .mergeMap(({app, investigation}) => {
                return [
                    $pathValue(
                        `investigationsById['${investigationIds}']['pivots'].length`,
                        investigation.pivots.length
                    ),
                    $invalidation(
                        `investigationsById['${investigationIds}']['pivots'][${0}..${investigation.pivots.length}]`
                    )
                ];
            })
            .catch(captureErrorAndNotifyClient(investigationIds));
    };
}

function insertPivotCallRoute({ loadInvestigationsById, insertPivot }) {
    return function(path, args) {
        const investigationIds = path[1];
        const pivotIndex = args[0];

        return insertPivot({loadInvestigationsById, investigationIds, pivotIndex})
            .mergeMap(({investigation, insertedIndex}) => {
                const pivots = investigation.pivots
                const length = pivots.length;

                const values = [
                    $pathValue(`investigationsById['${investigation.id}']['pivots'].length`, length),
                    $pathValue(
                        `investigationsById['${investigation.id}']['pivots'][${insertedIndex}]`,
                        pivots[insertedIndex]
                    ),
                ];

                if (insertedIndex < length - 1) { // Inserted pivot is not the last one in the list
                    values.push($invalidation(
                        `investigationsById['${investigation.id}']['pivots'][${insertedIndex + 1}..${length - 1}]`
                    ));
                }

                return values;
            })
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function playCallRoute({ loadInvestigationsById, loadPivotsById, loadUsersById, uploadGraph }) {
    return function(path, args) {
        const investigationIds = path[1];

        return uploadGraph({loadInvestigationsById, loadPivotsById, loadUsersById, investigationIds})
            .mergeMap(({app, investigation}) => {
                return [
                    $pathValue(`investigationsById['${investigationIds}'].url`, investigation.url),
                    $pathValue(`investigationsById['${investigationIds}'].status`, investigation.status),
                    $pathValue(`investigationsById['${investigationIds}'].eventTable`, investigation.eventTable)
                ];
            })
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function saveCallRoute({ loadInvestigationsById, savePivotsById, saveInvestigationsById }) {
    return function(path, args) {
        const investigationIds = path[1];

        return saveInvestigationsById({savePivotsById, investigationIds})
            .mergeMap(({app, investigation}) => [
                $pathValue(`investigationsById['${investigationIds}'].modifiedOn`, investigation.modifiedOn)
            ])
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function cloneCallRoute({ loadInvestigationsById, loadPivotsById, loadUsersById, cloneInvestigationsById }) {
    return function(path, args) {
        const investigationIds = path[1];
        return cloneInvestigationsById({loadInvestigationsById, loadPivotsById,
                                        loadUsersById, investigationIds})
            .mergeMap(({app, user, clonedInvestigation, numInvestigations}) => {
                return [
                    $pathValue(`['usersById'][${user.id}]['investigations'].length`, numInvestigations),
                    $pathValue(`['usersById'][${user.id}].activeInvestigation`, user.activeInvestigation),
                    $invalidation(`['usersById'][${user.id}]['investigations']['${numInvestigations - 1}']`)
                ];
            })
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function captureErrorAndNotifyClient(investigationIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const status = {
            ok: false,
            code: errorCode,
            message: `Server error: ${e.message} (code: ${errorCode})`,
            msgStyle: 'danger',
        }

        return Observable.from([
            $pathValue(`investigationsById['${investigationIds}']['status']`, $error(status))
        ]);
    }
}
