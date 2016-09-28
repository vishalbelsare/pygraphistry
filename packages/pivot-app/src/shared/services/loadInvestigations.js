import { Observable } from 'rxjs';
import fs  from 'fs';
import path from 'path';
import { serializeInvestigationModel } from '../models';

export function loadInvestigations(loadApp) {
    return function loadInvestigationsById({ investigationIds }) {
        return loadApp()
            .mergeMap(
            (app) => investigationIds.filter((investigationId) => (
                investigationId in app.investigationsById
            )),
            (app, investigationId) => ({
                app, investigation: app.investigationsById[investigationId]
            })
        );
    };
}

export function saveInvestigations(loadApp, pathPrefix) {
    const writeFileAsObservable = Observable.bindNodeCallback(fs.writeFile);

    return function saveInvestigationsById({loadInvestigationsById, investigationIds}) {
        return loadInvestigationsById({investigationIds})
            .mergeMap(({app, investigation}) => {
                const filePath = path.resolve(pathPrefix, investigation.id + '.json')
                const content = JSON.stringify(serializeInvestigationModel(investigation), null, 4);

                return writeFileAsObservable(filePath, content)
                    .map(() => Observable.of({app, investigation}));
            });
    };
}
