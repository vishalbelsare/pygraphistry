import { Observable } from 'rxjs';
import fs  from 'fs';
import path from 'path';
import glob from 'glob';
import { serializeInvestigationModel } from '../models';


export function investigationStore(loadApp, pathPrefix) {
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);

    function loadInvestigationsById({ investigationIds }) {
        return loadApp()
            .mergeMap(
            (app) => investigationIds.filter((investigationId) => (
                investigationId in app.investigationsById
            )),
            (app, investigationId) => ({
                app, investigation: app.investigationsById[investigationId]
            })
        );
    }

    function saveInvestigationsById({loadInvestigationsById, savePivotsById, investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                const filePath = path.resolve(pathPrefix, investigation.id + '.json')
                const content =
                    JSON.stringify({
                        ...serializeInvestigationModel(investigation),
                        modifiedOn: (new Date()).toDateString()
                    },
                    null,
                    4
                );
                const pivotIds = investigation.pivots.map(x => x.value[1])

                return savePivotsById({pivotIds})
                    .switchMap(() => writeFileAsObservable(filePath, content))
                    .map(() => ({app, investigation}));
            });
    }


    return {
        loadInvestigationsById,
        saveInvestigationsById
    };
}

export function listInvestigations(pathPrefix) {
    const globAsObservable = Observable.bindNodeCallback(glob);
    const readFileAsObservable = Observable.bindNodeCallback(fs.readFile);

    return globAsObservable(path.resolve('tests/appdata/investigations', '*.json'))
        .flatMap(x => x)
        .flatMap(file => readFileAsObservable(file).map(JSON.parse))
        .toArray();
}
