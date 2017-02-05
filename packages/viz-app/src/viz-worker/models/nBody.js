import { Subject } from 'rxjs';
import * as CLjs from '../simulator/cl';
import * as SimCL from '../simulator/SimCL';
import * as NBody from '../simulator/NBody';
import Dataframe from '../simulator/Dataframe';
import { Renderer } from 'viz-shared/renderers';
import { scenes } from 'viz-shared/models/scene';
import * as driver from '../simulator/node-driver';
import { controls as layoutControls } from '../simulator/layout.config';

import KernelCache from '../simulator/KernelCache';
import { preload as preloadKernels } from '../simulator/KernelPreload';


///////////////// PRELOAD CL CONTEXT, KERNELS /////////////////

import _config from '@graphistry/config';
const { GPU_OPTIONS: { vendor, device } = {} } = _config();

const renderer = new Renderer();
const contexts = CLjs.createSync(renderer, device, vendor);
const kernelCache = new KernelCache();

preloadKernels(contexts, kernelCache);

///////////////////////////////////////////////////////////////


export function nBody(dataset) {

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
