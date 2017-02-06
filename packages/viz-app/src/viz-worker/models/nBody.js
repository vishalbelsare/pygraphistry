import { Subject } from 'rxjs';
import * as SimCL from '../simulator/SimCL';
import * as NBody from '../simulator/NBody';
import Dataframe from '../simulator/Dataframe';
import { scenes } from 'viz-shared/models/scene';
import * as driver from '../simulator/node-driver';
import { controls as layoutControls } from '../simulator/layout.config';

import { preloaded } from '../simulator/KernelPreload';


export function nBody(dataset) {

    const { 
        vendor, device,
        renderer, contexts, kernelCache
    } = preloaded();

    const {
        bg, id, scene,
        controls: datasetControls,
    } = dataset;

    const dataframe = new Dataframe();
    const interactions = new Subject();
    const simulator = SimCL.createSync(
        dataframe, renderer, contexts, device,
        vendor, layoutControls[datasetControls],
        kernelCache
    );

    const nBody = NBody.createSync({
        vgraphLoaded: false,
        scene: scenes[scene](),
        bg, id, dataset, stepNumber: 0,
        globalControls: simulator.controls.global,
        renderer, dataframe, interactions, simulator
    });

    nBody.interactionsLoop = driver.createInteractionsLoop({
        nBody, dataset, interactions
    });

    return nBody;
}
