import { bind } from 'lodash'
import { Observable } from 'rxjs/Observable';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/do';

import { createGraph } from './createGraph';

export function loadGraphDriver({
        graphsById, workbook, dataset, socket, server
    }) {

    const graphId = workbook.id + dataset.id;
    const graph = graphsById[graphId] ?
        graphsById[graphId] : createGraph(dataset, socket);

    const { interactions, interactionsLoop } = graph;

    server.graph.next(graph);
    server.animationStep = {
        interact(x) {
            interactions.next(x);
        }
    };
    server.ticks.next(interactionsLoop);

    return server.ticksMulti.take(1).do((graph) => {
        graphsById[graphId] = graph;
    });
}
