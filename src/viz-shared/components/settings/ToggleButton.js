import styles from './settings.less';
import { Component } from 'reaxtor';

export class ToggleButton extends Component {
    loadProps(model) {
        return model.get(`id`, `name`, `type`, ['value', null]);
    }
    render({ id, name, type, value }) {
        return (
            <div class_={{
                [styles[type]]: true,
                [styles.control] :true
            }}>
                {name}
            </div>
        );
    }
}

