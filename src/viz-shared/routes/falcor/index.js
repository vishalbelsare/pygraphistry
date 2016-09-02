import { app } from './app';
import { views } from './views';
import { toolbar } from './toolbar';
import { workbooks } from './workbooks';
import { inspector, timebar } from './panels';
import { scene, camera, labels, layout, selection } from './scene';
import { filters, exclusions, histograms, expressions } from './expressions';

export function routes(services) {

    const workbook = `workbooksById[{keys}]`;
    const view = `${workbook}.viewsById[{keys}]`;

    return ([].concat(...[

        app(services),

        workbooks([], ``)(services),

        views(['workbook', 'view'], view)(services),
        toolbar(['workbook', 'view'], view)(services),

        scene(['workbook', 'view'], view)(services),
        camera(['workbook', 'view'], `${view}.scene`)(services),
        labels(['workbook', 'view'], `${view}.scene`)(services),
        layout(['workbook', 'view'], `${view}.scene`)(services),
        selection(['workbook', 'view'], `${view}.scene`)(services),

        timebar(['workbook', 'view'], view)(services),
        inspector(['workbook', 'view'], view)(services),

        filters(['workbook', 'view'], view)(services),
        exclusions(['workbook', 'view'], view)(services),
        histograms(['workbook', 'view'], view)(services),
        expressions(['workbook', 'view'], view)(services),
    ]));
}
