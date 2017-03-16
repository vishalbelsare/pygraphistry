import { labels } from 'viz-app/models/labels';
import { toolbar } from 'viz-app/models/toolbar';

export default function migrateV1(workbook, options) {
    const { viewsById = {} } = workbook;
    for (const viewId in viewsById) {
        const view = viewsById[viewId];
        viewsById[viewId] = {
            ...view,
            ...toolbar(workbook.id, viewId),
            labels: { ...labels(view).labels, ...view.labels }
        };
    }
    return workbook;
}
