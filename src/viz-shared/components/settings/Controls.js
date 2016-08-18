import styles from './settings.less';
import { Component } from 'reaxtor';

import { Slider } from './Slider';
import { TextInput } from './TextInput';
import { ColorPicker } from './ColorPicker';
import { ToggleButton } from './ToggleButton';

const controlsById = {
    // 'display-time-zone': displayTimeZoneInput
};

const controlsByType = {
    'text': TextInput,
    'bool': ToggleButton,
    'color': ColorPicker,
    'discrete': Slider,
    'continuous': Slider
};

export class Controls extends Component {
    observe(models, depth) {
        return function createControl(models, { id, type }, key, index) {
            const ControlComponent = controlsById[id] || controlsByType[type];
            return new ControlComponent({
                models, path: key,
                index, depth: depth + 1
            });
        };
    }
    deref(create, subjects, children, depth, model, state, range) {
        return super.deref(create, subjects, children, depth, model, state.controls, range);
    }
    loadProps(model) {
        return model.getItems(
            () => [[['id', 'name']], ['controls', 'length']],
            ({ json: { controls: { length }}}) => !length ? [] : [
                ['controls', {length}, 'value', null],
                ['controls', {length}, ['id', 'name', 'type']]
            ]
        );
    }
    render({ id, name }, ...controls) {
        return (
            <div title={name} class_={{ [styles['control-group']]: true }}>
                {controls}
            </div>
        );
    }
}
