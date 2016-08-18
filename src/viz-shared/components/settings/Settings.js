import styles from './settings.less';
import { Component } from 'reaxtor';
import { Controls } from './Controls';

export class Settings extends Component {
    observe(models, depth) {
        return (models, state, key, index) => new Controls({
            models, path: key,
            index, depth: depth + 1
        });
    }
    loadProps(model) {
        return model.getItems(
            () => [`['name', 'open', 'length']`],
            ({ json: { length }}) => !length ? [] : [
                [{length}, 'controls', 'length']
            ]
        );
    }
    render(state, ...controls) {
        return (
            <div class_={{ [styles['settings']]: true }}>
                {controls}
            </div>
        );
    }
}
