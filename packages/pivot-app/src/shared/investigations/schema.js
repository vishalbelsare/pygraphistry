import { Observable } from 'rxjs';
import { logErrorWithCode } from 'pivot-shared/util';
import { withSchema } from '@graphistry/falcor-react-schema';
import { $pathValue, $invalidation } from '@graphistry/falcor-json-graph';

import logger from 'pivot-shared/logger.js';
const log = logger.createLogger(__filename);

export default withSchema((QL, { get, set }, services) => {

    const { loadInvestigationsById } = services;

    const readOnlyHandler = {
        get: get(loadInvestigationsById)
    };
    const readWriteHandler = {
        get: get(loadInvestigationsById),
        set: set({
            unboxAtoms: false,
            service: loadInvestigationsById
        })
    };

    const insertPivotHandler = { call: insertPivotCallRoute(services) };
    const splicePivotHandler = { call: splicePivotCallRoute(services) };
    const saveInvestigationHandler = { call: saveCallRoute(services) };
    const graphInvestigationHandler = { call: graphCallRoute(services) };

    return QL`{
        eventTable: ${ readOnlyHandler },
        ['id', 'name', 'tags', 'url', 'status', 'description', 'time', 'modifiedOn', 'layout', 'axes', 'edgeOpacity']: ${
            readWriteHandler
        },
        pivots: {
            length: ${ readOnlyHandler },
            [{ integers }]: ${ readOnlyHandler }
        },
        save: ${ saveInvestigationHandler },
        graph: ${ graphInvestigationHandler },
        insertPivot: ${ insertPivotHandler },
        splicePivot: ${ splicePivotHandler }
    }`;
});

function splicePivotCallRoute({ loadInvestigationsById, unloadPivotsById, splicePivot }) {
    return function(path, args) {
        const investigationIds = path[1];
        const pivotIndex = args[0];

        return splicePivot({loadInvestigationsById, unloadPivotsById, investigationIds,
                            pivotIndex, deleteCount: 1})
            .mergeMap(({ investigation }) => {
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

function graphCallRoute({ loadInvestigationsById, loadPivotsById, loadUsersById, uploadGraph }) {
    return function(path) {
        const investigationIds = path[1];

        return uploadGraph({loadInvestigationsById, loadPivotsById, loadUsersById, investigationIds})
            .mergeMap(({ investigation }) => {
                return [
                    $pathValue(`investigationsById['${investigationIds}'].url`, investigation.url),
                    $pathValue(`investigationsById['${investigationIds}'].axes`, investigation.axes),
                    $pathValue(`investigationsById['${investigationIds}'].edgeOpacity`, investigation.edgeOpacity),
                    $pathValue(`investigationsById['${investigationIds}'].status`, investigation.status),
                    $pathValue(`investigationsById['${investigationIds}'].eventTable`, investigation.eventTable)
                ];
            })
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function saveCallRoute({ loadInvestigationsById, saveInvestigationsById, persistInvestigationsById,
                         persistPivotsById, unlinkPivotsById }) {
    return function(path) {
        const investigationIds = path[1];

        return saveInvestigationsById({loadInvestigationsById, persistInvestigationsById,
                                       persistPivotsById, unlinkPivotsById, investigationIds})
            .mergeMap(({ investigation }) => [
                $pathValue(`investigationsById['${investigationIds}'].modifiedOn`, investigation.modifiedOn),
                $pathValue(`investigationsById['${investigationIds}'].status`, { ok: false, saved: true, msgStyle: 'success', message: 'Investigation Saved!'})
            ])
            .catch(captureErrorAndNotifyClient(investigationIds));
    }
}

function captureErrorAndNotifyClient(investigationIds) {
    return function(e) {
        const errorCode = logErrorWithCode(log, e);
        const status = {
            ok: false,
            etling: false,
            code: errorCode,
            message: `Server error: ${e.message} (code: ${errorCode})`,
            msgStyle: 'danger',
        }

        return Observable.from([
            $pathValue(`investigationsById['${investigationIds}']['status']`, status)
        ]);
    }
}
