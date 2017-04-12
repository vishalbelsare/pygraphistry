import { scene } from 'viz-app/models/scene';
import { labels } from 'viz-app/models/labels';
import { toolbar } from 'viz-app/models/toolbar';

export default function migrateV1(workbook) {
    const { viewsById = {} } = workbook;
    for (const viewId in viewsById) {
        const view = viewsById[viewId];
        const viewRoute = `workbooksById['${workbook.id}'].viewsById['${viewId}']`;
        const newLabels = labels(viewRoute).labels;
        const newScene = scene(viewRoute, view.scene.id).scene;
        viewsById[viewId] = {
            ...view,
            ...toolbar(workbook.id, viewId),
            labels: {
                ...newLabels, ...view.labels,
                options: newLabels.options
            },
            scene: {
                ...newScene, ...view.scene,
                settings: newScene.settings
            }
        };
    }
    return workbook;
}
