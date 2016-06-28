import flake from 'simpleflake';
import { ref as $ref } from 'falcor-json-graph';

export function workbook(dataset, workbookId = flake().toString('hex')) {
    const viewId = flake().toString('hex');
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
        viewsById: {
            [viewId]: {
                id: viewId, scene: {}
            }
        },
        contentName: '',
        datasets: {
            length: 1,
            0: dataset,
            current: dataset
        }
    };
}
