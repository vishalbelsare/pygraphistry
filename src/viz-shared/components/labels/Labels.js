import styles from './labels.less';
import { Label } from './Label';
import { Component } from 'reaxtor';

// const DimCodesToTypes = {
//     1: 'point',
//     2: 'edge'
// };

export class Labels extends Component {
    observe(models, depth) {
        return (models, state, key, index) => new Label({
            models, path: key,
            index, depth: depth + 1
        });
    }
    loadProps(model, state) {
        return model.getItems(
            () => [
                `scene.labels.length`,
                `['background', 'foreground'].color`,
                `['opacity', 'enabled', 'poiEnabled']`
            ],
            ({ json: { scene: { labels: { length }}}}) => !length ? [] : [
                ['scene', 'labels', { length }, null]
            ]
        );
    }
    deref(create, subjects, children, depth, model, state) {
        const { active } = state;
        return super.deref(create, subjects, children, depth, model, state, active);
    }
    render(state, ...labels) {
        return (
            <div class_={{ [styles['labels-container']]: true }}>{
                labels
            }</div>
        );
    }
}
