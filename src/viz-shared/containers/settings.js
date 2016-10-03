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
            length ${Array
            .from(settings, (xs, i) => xs)
            .reduce((xs, options, index) => `
                ${xs},
                ${index}: ${
                    Options.fragment(options)
                }`
            , '')}
        }
    }`
)(Settings);

Options = container(
    (options = []) => `{
        name, length ${Array
        .from(options, (xs, i) => xs)
        .reduce((xs, control, index) => `
            ${xs},
            ${index}: ${
                Control.fragment(control)
            }
        `, '')}
    }`,
    (options) => ({ options, name: options.name })
)(Options);

// Control = container(
//     ({ stateKey } = {}) => !stateKey ?
//         `{ id, name, type, props, stateKey }` :
//         `{ id, name, type, props, stateKey, state: { ${stateKey} } }`,
//     ({ state, stateKey, ...control }) => ({
//         state: state && stateKey && state[stateKey], stateKey, ...control
//     }),
//     { setValue: setControlValue }
// )(Control);

Control = container(
    () => `{ id, name, type, props, value: {${null}} }`,
    (x) => x,
    { setValue: setControlValue }
)(Control);

export { Settings, Options, Control };
