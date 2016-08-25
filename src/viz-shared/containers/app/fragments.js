import { View } from 'viz-shared/containers/view';

export function AppFragment({ workbooks = [] } = {}) {
    const { open: workbook = {} } = workbooks;
    const { views = [] } = workbook;
    const { current: view = {} } = views;
    return `{
        release: { current: { date }},
        workbooks: {
            length, open: {
                views: {
                    length, current: ${
                        View.fragment(view)
                    }
                }
            }
        }
    }`;
}
