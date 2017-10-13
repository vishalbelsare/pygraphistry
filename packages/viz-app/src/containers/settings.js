import React from 'react';
import { container } from '@graphistry/falcor-react-redux';
import {
    Slider,
    ToggleButton,
    ColorPicker,
    SettingsList,
    ControlsList
} from 'viz-app/components/settings';

import { setControlValue } from 'viz-app/actions/settings';

const controlsById = {
    // 'display-time-zone': displayTimeZoneInput
};

const controlsByType = {
    bool: ToggleButton,
    color: ColorPicker,
    discrete: Slider,
    continuous: Slider
};

let Settings = ({ id, name, settings = [], ...props } = {}) => {
    return (
        <SettingsList id={id} name={name} {...props}>
            {settings.map((options, index) => (
                <Options data={options} key={`${index}: ${options.name}`} />
            ))}
        </SettingsList>
    );
};

let Options = ({ name, options = [], ...props } = {}) => {
    return (
        <ControlsList name={name} {...props}>
            {options.map((control, index) => (
                <Control data={control} key={`${index}: ${control.id}`} />
            ))}
        </ControlsList>
    );
};

let Control = ({ id, type, ...rest } = {}) => {
    const Component = controlsById[id] || controlsByType[type];
    if (!Component) {
        return null;
    }
    return <Component id={id} type={type} {...rest} />;
};

Settings = container({
    renderLoading: true,
    fragment: ({ settings = [] } = {}) => `{
        id, name, settings: ${Options.fragments(settings)}
    }`
})(Settings);

Options = container({
    renderLoading: true,
    fragment: (options = []) => `{
        name, ...${Control.fragments(options)}
    }`,
    mapFragment: options => ({
        options,
        name: options.name
    })
})(Options);

const withControlContainer = container({
    renderLoading: true,
    fragment: () => `{ id, name, type, props, value: {${null}} }`,
    dispatchers: {
        setValue: setControlValue
    }
});

Control = withControlContainer(Control);

export { withControlContainer };
export { Settings, Options, Control };
