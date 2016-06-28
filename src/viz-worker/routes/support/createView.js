import { getBlankViewTemplate } from '../../workbook';

export function createView(viewId) {
    const view = { ...getBlankViewTemplate(), id: viewId };
    // delete view.parameters;
    return view;
}
