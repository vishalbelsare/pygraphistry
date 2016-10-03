import { app } from './app';
import { views } from './views';
import { labels } from './labels';
import { layout } from './layout';
import { toolbar } from './toolbar';
import { selection } from './selection';
import { workbooks } from './workbooks';
import { scene, camera } from './scene';
import { inspector, timebar } from './panels';

import { filters, exclusions, histograms, expressions } from './expressions';

export function routes(services) {

    const workbook = `workbooksById[{keys}]`;
    const view = `${workbook}.viewsById[{keys}]`;

    return ([].concat(...[

        app(services),

        workbooks([], ``)(services),

        views(['workbook', 'view'], `${view}`)(services),
        toolbar(['workbook', 'view'], `${view}`)(services),

        scene(['workbook', 'view'], `${view}`)(services),
        camera(['workbook', 'view'], `${view}`)(services),

        labels(['workbook', 'view'], `${view}`)(services),
        layout(['workbook', 'view'], `${view}`)(services),
        selection(['workbook', 'view'], `${view}`)(services),

        timebar(['workbook', 'view'], `${view}`)(services),
        inspector(['workbook', 'view'], `${view}`)(services),

        filters(['workbook', 'view'], `${view}`)(services),
        exclusions(['workbook', 'view'], `${view}`)(services),
        histograms(['workbook', 'view'], `${view}`)(services),
        expressions(['workbook', 'view'], `${view}`)(services),
    ]));
}
