import { views } from './views';
import { scene } from './scene';
import { labels } from './labels';
import { release } from './release';
import { controls } from './controls';
import { workbooks } from './workbooks';

export function falcorRoutes(services) {
    return ([]
        .concat(scene(services))
        .concat(views(services))
        .concat(labels(services))
        .concat(release(services))
        .concat(controls(services))
        .concat(workbooks(services))
    );
}
