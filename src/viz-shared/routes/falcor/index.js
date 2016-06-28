import { views } from './views';
import { scene } from './scene';
import { labels } from './labels';
import { release } from './release';
import { controls } from './controls';
import { workbooks } from './workbooks';

export function falcorRoutes(services, props) {
    return ([]
        .concat(scene(services, props))
        .concat(views(services, props))
        .concat(labels(services, props))
        .concat(release(services, props))
        .concat(controls(services, props))
        .concat(workbooks(services, props))
    );
}
