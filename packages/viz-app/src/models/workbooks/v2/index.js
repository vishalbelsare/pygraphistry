import { $ref } from '@graphistry/falcor-json-graph';
import { dataset as createDataset } from 'viz-app/models/workbooks';

export default function migrateV2(workbook, options) {
    workbook.datasets = [createDataset(options)];
    const { viewsById = {} } = workbook;
    for (const viewId in viewsById) {
        const view = viewsById[viewId];
        const { expressionsById } = view;

        if (view.scene && view.scene.renderer) {
            view.scene.renderer.edges.elements = 0;
            view.scene.renderer.points.elements = 0;
        }

        const { filters, exclusions, histograms } = view;
        for (let i = -1, n = histograms.length; ++i < n;) {
            histograms[i] = undefined;
        }
        view.histogramsById = {};
        view.histograms.length = 0;

        if (filters.controls && filters.controls[0]) {
            filters.controls[0].items = $ref(`workbooksById['${
                workbook.id}'].viewsById['${
                    view.id}'].filters`);
        }
        if (exclusions.controls && exclusions.controls[0]) {
            exclusions.controls[0].items = $ref(`workbooksById['${
                workbook.id}'].viewsById['${
                    view.id}'].exclusions`);
        }
        if (histograms.controls && histograms.controls[0]) {
            histograms.controls[0].items = $ref(`workbooksById['${
                workbook.id}'].viewsById['${
                    view.id}'].histograms`);
        }

        const defaultFilterRef = view.filters && view.filters[0] && view.filters[0].value;
        const defaultFilter = expressionsById && defaultFilterRef &&
            expressionsById[defaultFilterRef[defaultFilterRef.length - 1]];

        if (defaultFilter && defaultFilter.input === 'LIMIT 800000') {
            defaultFilter.level = undefined;
            defaultFilter.readOnly = false;
        }
    }
    return workbook;
}
