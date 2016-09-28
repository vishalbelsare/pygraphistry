import { Observable } from 'rxjs';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { createInvestigationModel } from '../models';

export function createInvestigation({ loadApp }) {
    return loadApp()
        .map(app => {
            const newInvestigation = createInvestigationModel({}, app.investigations.length)

            app.investigationsById[newInvestigation.id] = newInvestigation;
            app.investigations.push(newInvestigation);
            app.selectedInvestigation = $ref(`investigationsById['${newInvestigation.id}']`);

            const numInvestigations = app.investigations.length;
            return ({app, newInvestigation, numInvestigations});
        });
}

