import { app } from '../app/routes';
import { views } from '../views/routes';
import { scene } from '../scene/routes';
import { labels } from '../labels/routes';
import { workbooks } from '../workbooks/routes';
import { filters } from '../filters/routes';
import { toolbar } from '../toolbar/routes';
import { settings } from '../settings/routes';

export function falcorRoutes(services) {

    return ([].concat(...[

        app(services),

        workbooks(services),

        scene(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services),

        views(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services),

        labels(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services),

        filters(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services),

        settings(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services),

        toolbar(
            ['workbook', 'view'],
            `workbooksById[{keys}].viewsById[{keys}]`
        )(services)
    ]));
}
