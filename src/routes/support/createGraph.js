import { Subject } from 'rxjs/Subject';
import { scenes as rendererScenes } from '../../renderer.config';
import {
    controls as layoutControls,
    toClient as fromLayoutAlgorithms
} from '../../layout.config';

import Dataframe from '../../Dataframe';

import * as cljs from '../../cl';
import * as NBody from '../../NBody';
import * as driver from '../../node-driver';
import * as RenderNull from '../../RenderNull';

export function createGraph (dataset, socket) {

    const { id, metadata } = dataset;
    const { vendor, device } = metadata;

    if (!(metadata.scene in rendererScenes)) {
        metadata.scene = 'default';
    }

    if (!(metadata.controls in layoutControls)) {
        metadata.controls = 'default';
    }

    const dataframe = new Dataframe();
    const interactions = new Subject();

    const scene = rendererScenes[metadata.scene];
    const renderer = RenderNull.createSync(null);
    const sceneControls = layoutControls[metadata.controls];

    const contexts = cljs.createSync(renderer, device, vendor);
    const simulator = sceneControls[0].simulator.createSync(
        dataframe, renderer, contexts, device, vendor, sceneControls
    );

    const globalControls = simulator.controls.global;
    const layoutAlgorithms = fromLayoutAlgorithms(simulator.controls.layoutAlgorithms);

    const graph = NBody.createSync({
        id, scene, device, socket, vendor,
        layoutAlgorithms, renderer, dataframe, simulator,
        interactions, globalControls, stepNumber: 0,
        __pointsHostBuffer: undefined
    });

    graph.interactionsLoop = driver.createInteractionsLoop({
        dataset, socket, graph, interactions
    });

    return Object.seal(graph);
}
