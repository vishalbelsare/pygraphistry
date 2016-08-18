import styles from './settings.less';
import { Component } from 'reaxtor';

export class Slider extends Component {
    loadProps(model) {
        return model.get(`id`, `name`, `type`, ['value', null], 'props');
    }
    render({ id, name, type, props, value }) {
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

