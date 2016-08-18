import React from 'react'
import styles from './styles.less';
import classNames from 'classnames';
import { connect } from 'reaxtor-redux';
import { setLayoutControlValue } from './actions';
import { SettingsFragment, ControlsFragment, ControlFragment } from './fragments';
import { Button, Panel, MenuItem, ListGroup, ListGroupItem } from 'react-bootstrap';

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
     SettingsFragment, (settings) => ({
     settings, name: settings.name, open: settings.open })
)(({ settings = [], name = '', open = false, style }) => {
    return (
        <ListGroup fill>
        {settings.map((controls) => [
            <MenuItem header>{controls.name}</MenuItem>,
            <ListGroupItem key={controls.key}>
                <Controls falcor={controls}/>
            </ListGroupItem>
        ])}
        </ListGroup>
    );
});

export const Controls = connect(
     ControlsFragment, (controls) => ({
     controls })
)(({ controls = [] }) => {
    return (
        <ListGroup>
        {controls.map((control, index) => (
            <ListGroupItem key={`${index}: ${control.key}`}>
                <Control falcor={control}/>
            </ListGroupItem>
        ))}
        </ListGroup>
    );
});

export const Control = connect(
     ControlFragment, null, {
     setValue: setLayoutControlValue }
)(({ setValue, id, type, ...props }) => {
    const Component = controlsById[id] || controlsByType[type];
    return !Component ? null : (
        <Component id={id} type={type}
                   setValue={setValue} {...props}/>
    );
});

function TextInput({ id, name, type, props, value }) {
    return (
        <span>{id} - {type} - {name}</span>
    );
}

function ToggleButton({ id, name, type, props, value }) {
    return (
        <span>{id} - {type} - {name}</span>
    );
}

function ColorPicker({ id, name, type, props, value }) {
    return (
        <span>{id} - {type} - {name}</span>
    );
}

function Slider({ id, name, type, props, value }) {
    return (
        <span>{id} - {type} - {name}</span>
    );
}
