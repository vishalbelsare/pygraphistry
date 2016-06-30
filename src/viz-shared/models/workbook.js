import { simpleflake } from 'simpleflakes';
import { ref as $ref } from 'falcor-json-graph';

export function workbook(dataset, workbookId = simpleflake().toJSON()) {
    const viewId = simpleflake().toJSON();
    return {
        id: workbookId,
        title: '',
        views: {
            length: 1,
            current: $ref(`workbooksById['${workbookId}']
                          .viewsById['${viewId}']`),
            0:       $ref(`workbooksById['${workbookId}']
                                .viewsById['${viewId}']`),
        },
        viewsById: {},
        contentName: '',
        datasets: {
            length: 1,
            0: dataset,
            current: dataset
        }
    };
}
