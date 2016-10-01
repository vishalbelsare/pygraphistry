import React from 'react'
import { container } from '@graphistry/falcor-react-redux';
import {
    Slider,
    TextInput,
    ToggleButton,
    ColorPicker,
    SettingsList,
    ControlsList,
} from 'viz-shared/components/settings'

import { setControlValue } from 'viz-shared/actions/settings';

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

let Settings = ({ id, name, settings = [], ...props } = {}) => {
    return (
        <SettingsList name={name} {...props}>
        {settings.map((options, index) => (
            <Options data={options} key={`${index}: ${options.name}`}/>
        ))}
        </SettingsList>
    );
};

let Options = ({ name, options = [], ...props } = {}) => {
    return (
        <ControlsList name={name}  {...props}>
        {options.map((control, index) => (
            <Control data={control} key={`${index}: ${control.id}`}/>
        ))}
        </ControlsList>
    );
};

let Control = ({ id, type, ...rest } = {}) => {
    const Component = controlsById[id] || controlsByType[type];
    if (!Component) {
        return null;
    }
    return (
        <Component id={id} type={type} {...rest}/>
   );
};

Settings = container(
    ({ settings = [] } = {}) => `{
        id, name, settings: {
            length, [0...${settings.length || 0}]: ${
                Options.fragment()
            }
        }
    }`
)(Settings);

Options = container(
    (options = []) => `{
        name, length, [0...${options.length || 0}]: ${
            Control.fragment()
        }
    }`,
    (options) => ({ options, name: options.name })
)(Options);

Control = container(
    ({ stateKey } = {}) => !stateKey ?
        `{ id, name, type, props, stateKey }` :
        `{ id, name, type, props, stateKey, state: { ${stateKey} } }`,
    ({ state, stateKey, ...control }) => ({
        state: state && stateKey && state[stateKey], stateKey, ...control
    }),
    { setValue: setControlValue }
)(Control);

export { Settings, Options, Control };
