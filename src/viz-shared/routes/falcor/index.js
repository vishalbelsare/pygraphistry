import { views } from './views';
import { scene } from './scene';
import { labels } from './labels';
import { release } from './release';
import { controls } from './controls';
import { workbooks } from './workbooks';

export function falcorRoutes(services, routesSharedState) {
    return ([]
        .concat(scene(services, routesSharedState))
        .concat(views(services, routesSharedState))
        .concat(labels(services, routesSharedState))
        .concat(release(services, routesSharedState))
        .concat(controls(services, routesSharedState))
        .concat(workbooks(services, routesSharedState))
    );
}
