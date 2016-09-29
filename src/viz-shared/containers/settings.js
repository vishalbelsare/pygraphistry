import React from 'react'
import { Panel } from 'react-bootstrap';
import { container } from '@graphistry/falcor-react-redux';
import {
    Slider,
    TextInput,
    ToggleButton,
    ColorPicker
} from 'viz-shared/components/settings'

import { Grid, Row, Col } from 'react-bootstrap';
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
        <Panel header={name} style={{ minWidth: `350px` }}>
        {settings.map((options, index) => (
            <Options data={options} key={`${index}: ${options.name}`}/>
        ))}
        </Panel>
    );
};

let Options = ({ name, options = [] } = {}) => {
    return (
        <Grid fluid style={{ padding: 0 }}>
        {name &&
            <Row>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <h6>{name}</h6>
                </Col>
            </Row>}
        {options.map((control, index) => (
            <Control data={control} key={`${index}: ${control.id}`}/>
        ))}
        </Grid>
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
