import { Filters } from '../filters';
import { Toolbar } from '../toolbar';
import { Settings } from '../settings';

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
                        ViewFragment(view)
                    }
                }
            }
        }
    }`;
}

export function ViewFragment({ filters, toolbar, settings } = {}) {
    return `{
        openPanel,
        filters: ${
            Filters.fragment(filters)
        },
        toolbar: ${
            Toolbar.fragment(toolbar)
        },
        settings: ${
            Settings.fragment(settings)
        }
    }`;
}

