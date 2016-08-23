import React from 'react'
import { connect } from 'reaxtor-redux';
import {
    Slider,
    TextInput,
    ToggleButton,
    ColorPicker
} from 'viz-shared/components/settings'

import { Grid, Row, Col } from 'react-bootstrap';

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

export const Settings = connect(
    ({ settings = [] } = {}) => `{
        id, name, settings: {
            length, [0...${settings.length}]: ${
                Options.fragment()
            }
        }
    }`
)(renderSettings);

export const Options = connect(
    (options = []) => `{
        name, length, [0...${options.length}]: ${
            Control.fragment()
        }
    }`,
    (options) => ({ options, name: options.name })
)(renderOptions);

export const Control = connect(
    ({ stateKey } = {}) => !stateKey ?
        `{ id, name, type, props, stateKey }` :
        `{ id, name, type, props, stateKey, state: { ${stateKey} } }`
    ,
    ({ stateKey, state, ...control }) => ({
        state: state && state[stateKey], ...control
    }),
    { setValue }
)(renderControl);

function renderSettings({ settings = [] } = {}) {
    return (
        <div>
        {settings.map((options) => (
            <Options key={options.key} falcor={options}/>
        ))}
        </div>
    );
}

function renderOptions({ name, options = [] } = {}) {
    return (
        <Grid fluid style={{ padding: 0 }}>
        {name &&
            <Row>
                <Col xs={12} sm={12} md={12} lg={12}>
                    <h6>{name}</h6>
                </Col>
            </Row>}
        {options.map((control, index) => (
            <Control key={`${index}: ${control.key}`} falcor={control}/>
        ))}
        </Grid>
    )
}

function renderControl({ id, type, ...rest } = {}) {
    const Component = controlsById[id] || controlsByType[type];
    if (!Component) {
        return null;
    }
    return (
        <Component id={id} type={type} {...rest}/>
   );
}

function setValue(id, type, value) {
    return { type: 'set-control-value', id, type, value };
}
