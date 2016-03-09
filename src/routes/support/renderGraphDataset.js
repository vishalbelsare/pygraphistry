import { Observable } from 'rxjs/Observable';

import 'rxjs/add/observable/of';
import 'rxjs/add/observable/from';
import 'rxjs/add/operator/do';

import { scenes } from '../../renderer.config';
import { controls } from '../../layout.config';

export function renderGraphDataset(dataset) {

    const { metadata } = dataset;

    if (!(metadata.scene in scenes)) {
        metadata.scene = 'default';
    }

    if (!(metadata.controls in controls)) {
        metadata.controls = 'default';
    }

    const graph = {
        id: dataset.id,
        vendor: metadata.vendor,
        device: metadata.device,
        renderer: scenes[metadata.scene],
        controls: controls[metadata.controls],
    };

    return Observable.of(graph);
}
