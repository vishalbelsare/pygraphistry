import { Subject } from 'rxjs';
import * as CLjs from '../simulator/cl';
import * as SimCL from '../simulator/SimCL';
import * as NBody from '../simulator/NBody';
import Dataframe from '../simulator/Dataframe';
import { Renderer } from 'viz-shared/renderers';
import { scenes } from 'viz-shared/models/scene';
import * as driver from '../simulator/node-driver';
import { controls as layoutControls } from '../simulator/layout.config';

export function nBody(dataset) {

    const {
        bg, id, scene,
        vendor, device,
        controls: datasetControls,
    } = dataset;

    const renderer = new Renderer();
    const dataframe = new Dataframe();
    const interactions = new Subject();
    const contexts = CLjs.createSync(renderer, device, vendor);
    const simulator = SimCL.createSync(
        dataframe, renderer, contexts, device,
        vendor, layoutControls[datasetControls]
    );

    const nBody = NBody.createSync({
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
