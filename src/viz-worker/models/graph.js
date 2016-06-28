import { Subject } from '@graphistry/rxjs';
import * as CLjs from '../simulator/cl';
import * as SimCL from '../simulator/SimCL';
import * as NBody from '../simulator/NBody';
import Dataframe from '../simulator/Dataframe';
import * as driver from '../simulator/node-driver';
import { Renderer } from '../../viz-shared/renderers';
import { controls as layoutControls } from '../simulator/layout.config';

export function graph(dataset) {

    const { vendor, device } = dataset;

    const renderer = new Renderer();
    const dataframe = new Dataframe();
    const interactions = new Subject();
    const contexts = CLjs.createSync(renderer, device, vendor);
    const simulator = SimCL.createSync(
        dataframe, renderer, contexts, device,
        vendor, layoutControls[dataset.controls]
    );

    const graph = NBody.createSync({
        ...dataset, stepNumber: 0,
        globalControls: simulator.controls.global,
        renderer, dataframe, interactions, simulator
    });

    graph.interactionsLoop = driver.createInteractionsLoop({
        graph, dataset, interactions
    });

    return graph;

/*
    const dataframe = new Dataframe();
    const interactions = new Subject();
    const renderer = RenderNull.createSync(null);
    const contexts = CLjs.createSync(renderer, device, vendor);
    const simulator = SimCL.createSync(
        dataframe, renderer, contexts, device,
        vendor, layoutControls[metadata.controls]
    );

    const graph = NBody.createSync({
        socket: server.socket, stepNumber: 0,
        id: dataset.id, device, server, vendor,
        globalControls: simulator.controls.global,
        renderer, dataframe, simulator, interactions,
    });

    graph.interactionsLoop = driver.createInteractionsLoop({
        graph, dataset, interactions
    });

    return graph;
*/
}
