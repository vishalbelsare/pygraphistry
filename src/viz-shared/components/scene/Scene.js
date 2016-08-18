import styles from './scene.less';
import { Canvas } from './canvas';
import { Labels } from './labels';
import { Component } from 'reaxtor';
import { Highlight } from './highlight';
import { Marquee } from './marquee';
import { Observable } from 'rxjs';

export class Scene extends Component {
    observe(models, depth) {

        const canvas = new Canvas({
            index: 0, depth: depth + 1,
            models: models.deref('scene')
        });
        const lasso = new Marquee({
            index: 1, depth: depth + 1,
            id: 'marquee', canDrag: false,
            models: models.deref('lasso')
        });
        const histogram = new Marquee({
            index: 2, depth: depth + 1,
            id: 'brush', canDrag: true,
            models: models.deref('histograms')
        });
        const highlight = new Highlight({
            index: 3, depth: depth + 1,
            models: models.deref('scene')
        });
        const labels = new Labels({
            index: 4, depth: depth + 1,
            models: models.deref('labels')
        });

        return [canvas, lasso, histogram];
    }
    // loadProps(model) {
    //     return model.get(...[
    //         `lasso.active.length`,
    //         `labels.active.length`,
    //         `histograms.active.length`,
    //         `['labels', 'lasso', 'histograms'].active.length`,
    //         `['labels', 'lasso', 'histograms']['name', 'open', 'selection']`,
    //         `scene[
    //             'buffers', 'textures', 'highlight',
    //             'targets', 'programs', 'arcHeight', 'triggers',
    //             'items', 'modes', 'render', 'models', 'uniforms',
    //             'numRenderedSplits', 'clientMidEdgeInterpolation'
    //         ]`,
    //     ]);
    // }
    render(state, ...children) {
        return (
            <div class_={{ [styles['sim-container']]: true }} tabindex="-1">{
                children
            }</div>
        );
    }
}
