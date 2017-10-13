import { Subject } from 'rxjs/Subject';
import { scenes } from 'viz-app/models/scene';
import * as SimCL from 'viz-app/worker/simulator/SimCL';
import * as NBody from 'viz-app/worker/simulator/NBody';
import Dataframe from 'viz-app/worker/simulator/Dataframe';
import * as driver from 'viz-app/worker/simulator/node-driver';
import { preloaded } from 'viz-app/worker/simulator/kernel/KernelPreload';
import { controls as layoutControls } from 'viz-app/worker/simulator/layout.config';

export function nBody(dataset) {
    const { vendor, device, renderer, contexts, kernelCache } = preloaded();

    const { bg, id, scene, controls: datasetControls } = dataset;

    const dataframe = new Dataframe();
    const interactions = new Subject();
    const simulator = SimCL.createSync(
        dataframe,
        renderer,
        contexts,
        device,
        vendor,
        layoutControls[datasetControls],
        kernelCache
    );

    const nBody = NBody.createSync({
        vgraphLoaded: false,
        scene: scenes[scene](),
        bg,
        id,
        dataset,
        stepNumber: 0,
        globalControls: simulator.controls.global,
        renderer,
        dataframe,
        interactions,
        simulator
    });

    nBody.interactionsLoop = driver.createInteractionsLoop({
        nBody,
        dataset,
        interactions
    });

    return nBody;
}
