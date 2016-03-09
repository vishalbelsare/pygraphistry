import { Observable } from 'rxjs/Observable';
import {
    ref as $ref,
    atom as $atom,
    error as $error,
    pathValue as $pathValue,
    pathInvalidation as $pathInvalidation,
} from 'falcor-json-graph';

import 'rxjs/add/observable/from';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/mergeMap';

import { scenes as rendererScenes } from '../renderer.config';
import { loadDataset } from './support/loadDataset';
import { controls as layoutControls } from '../layout.config';

export function renderer(datasetsById) {
    return [{
        route: `datasetsById[{keys: datasetIds}].renderer`,
        get({ datasetIds }) {
            const { renderConfig, socketLogger } = this.server;
            return Observable
                .from(datasetIds)
                .mergeMap(
                    (datasetId) => loadDataset(datasetsById, datasetId),
                    (datasetId, dataset) => {

                        const { metadata } = dataset;
                        if (!(metadata.scene in rendererScenes)) {
                            socketLogger.warn('WARNING Unknown scene "%s", using default', metadata.scene);
                            metadata.scene = 'default';
                        }

                        const val = rendererScenes[metadata.scene];
                        const path = `datasetsById['${datasetId}'].renderer`;

                        renderConfig.next(val);

                        return $pathValue(path, $atom(val));
                    });
        }
    }];
}
